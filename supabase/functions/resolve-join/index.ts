// LANDMAN — Resolve Join Token Edge Function
// POST https://<project>.supabase.co/functions/v1/resolve-join
//
// Public endpoint (no auth required). Called from the join link page.
// Resolves a join token to the user's synthetic email and display info
// so the frontend can sign in with email + PIN.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { token } = await req.json()

    if (!token) {
      return new Response(
        JSON.stringify({ error: 'token is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ── Service role client (bypasses RLS) ───────────────────────────
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── Look up the member by join_token ─────────────────────────────
    const { data: member } = await admin
      .from('property_members')
      .select('user_id, property_id, status')
      .eq('join_token', token)
      .maybeSingle()

    if (!member) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired link' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (member.status !== 'approved') {
      return new Response(
        JSON.stringify({ error: 'Account not yet approved' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ── Get the user's synthetic email from profiles ─────────────────
    const { data: profile } = await admin
      .from('profiles')
      .select('email, full_name')
      .eq('id', member.user_id)
      .single()

    if (!profile) {
      return new Response(
        JSON.stringify({ error: 'User profile not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ── Get the property name for the greeting ──────────────────────
    const { data: property } = await admin
      .from('properties')
      .select('name')
      .eq('id', member.property_id)
      .single()

    return new Response(
      JSON.stringify({
        email: profile.email,
        userName: profile.full_name || 'there',
        propertyName: property?.name || 'your property',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )

  } catch (err) {
    console.error('resolve-join: unhandled error', err)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
