// LANDMAN — Update PIN Edge Function
// POST https://<project>.supabase.co/functions/v1/update-pin
//
// Called by an admin to reset a member's PIN.
// Updates both the property_members.pin field and the auth.users password.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function generatePin(): string {
  return String(Math.floor(1000 + Math.random() * 9000))
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { memberId, newPin } = await req.json()

    if (!memberId) {
      return new Response(
        JSON.stringify({ error: 'memberId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ── Authenticate the caller ──────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

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

    // ── Service role client ─────────────────────────────────────────
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── Look up the member ──────────────────────────────────────────
    const { data: member } = await admin
      .from('property_members')
      .select('id, property_id, user_id, role')
      .eq('id', memberId)
      .single()

    if (!member) {
      return new Response(
        JSON.stringify({ error: 'Member not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ── Verify caller is admin of this property ─────────────────────
    const { data: callerMembership } = await admin
      .from('property_members')
      .select('is_admin')
      .eq('property_id', member.property_id)
      .eq('user_id', caller.id)
      .eq('status', 'approved')
      .eq('is_admin', true)
      .maybeSingle()

    if (!callerMembership) {
      return new Response(
        JSON.stringify({ error: 'You are not an admin of this property' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ── Cannot reset PIN for owners ─────────────────────────────────
    if (member.role === 'owner') {
      return new Response(
        JSON.stringify({ error: 'Cannot reset PIN for property owner' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ── Generate or use provided PIN ────────────────────────────────
    const pin = newPin || generatePin()

    // ── Update auth password ────────────────────────────────────────
    const { error: authError } = await admin.auth.admin.updateUserById(
      member.user_id,
      { password: pin },
    )

    if (authError) {
      console.error('update-pin: failed to update auth password', authError)
      return new Response(
        JSON.stringify({ error: 'Failed to update password' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ── Update property_members.pin ─────────────────────────────────
    const { error: memberError } = await admin
      .from('property_members')
      .update({ pin })
      .eq('id', memberId)

    if (memberError) {
      console.error('update-pin: failed to update member PIN', memberError)
    }

    return new Response(
      JSON.stringify({ pin }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )

  } catch (err) {
    console.error('update-pin: unhandled error', err)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
