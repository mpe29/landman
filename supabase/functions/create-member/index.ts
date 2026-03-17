// LANDMAN — Create Member Edge Function
// POST https://<project>.supabase.co/functions/v1/create-member
//
// Called by an admin to create a PIN-based user account and add them
// to a property. Returns the generated PIN and a shareable join link.
//
// Requires: authenticated user who is admin of the target property.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function generatePin(): string {
  return String(Math.floor(1000 + Math.random() * 9000))
}

function generateToken(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let token = ''
  for (let i = 0; i < 12; i++) {
    token += chars[Math.floor(Math.random() * chars.length)]
  }
  return token
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { propertyId, fullName, role } = await req.json()

    if (!propertyId || !fullName) {
      return new Response(
        JSON.stringify({ error: 'propertyId and fullName are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Validate role
    const validRoles = ['manager', 'staff', 'contractor']
    const memberRole = validRoles.includes(role) ? role : 'staff'

    // ── Authenticate the caller ──────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Client scoped to the caller's JWT (for auth check)
    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: { user: caller } } = await callerClient.auth.getUser()
    if (!caller) {
      return new Response(
        JSON.stringify({ error: 'Invalid auth token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ── Service role client (bypasses RLS) ───────────────────────────
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── Verify caller is admin of this property ─────────────────────
    const { data: membership } = await admin
      .from('property_members')
      .select('is_admin')
      .eq('property_id', propertyId)
      .eq('user_id', caller.id)
      .eq('status', 'approved')
      .eq('is_admin', true)
      .maybeSingle()

    if (!membership) {
      return new Response(
        JSON.stringify({ error: 'You are not an admin of this property' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ── Generate credentials ────────────────────────────────────────
    const pin = generatePin()
    const joinToken = generateToken()
    const syntheticEmail = `${crypto.randomUUID()}@pin.landman`

    // ── Create auth user with synthetic email + PIN as password ──────
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email: syntheticEmail,
      password: pin,
      email_confirm: true, // auto-confirm, no verification email
      user_metadata: { full_name: fullName },
    })

    if (authError) {
      console.error('create-member: failed to create auth user', authError)
      return new Response(
        JSON.stringify({ error: 'Failed to create user account' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const userId = authData.user.id

    // ── Create property_members row ─────────────────────────────────
    const { error: memberError } = await admin
      .from('property_members')
      .insert({
        property_id: propertyId,
        user_id: userId,
        role: memberRole,
        is_admin: false,
        status: 'approved',
        pin: pin,
        join_token: joinToken,
      })

    if (memberError) {
      console.error('create-member: failed to create membership', memberError)
      // Clean up the auth user we just created
      await admin.auth.admin.deleteUser(userId)
      return new Response(
        JSON.stringify({ error: 'Failed to create membership' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(
      JSON.stringify({
        userId,
        fullName,
        role: memberRole,
        pin,
        joinToken,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )

  } catch (err) {
    console.error('create-member: unhandled error', err)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
