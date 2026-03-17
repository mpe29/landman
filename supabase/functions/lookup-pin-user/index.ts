// LANDMAN — Lookup PIN User Edge Function
// POST https://<project>.supabase.co/functions/v1/lookup-pin-user
//
// Public endpoint (no auth required). Called from the login screen
// when a user wants to sign in with their name + PIN.
// Returns the synthetic email so the frontend can sign in.

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
    const { name } = await req.json()

    if (!name || name.trim().length < 2) {
      return new Response(
        JSON.stringify({ error: 'Please enter your name' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Find PIN users matching this name (synthetic email = *@pin.landman)
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, full_name, email')
      .ilike('full_name', name.trim())
      .like('email', '%@pin.landman')

    if (!profiles || profiles.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No account found with that name' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (profiles.length > 1) {
      // Multiple matches — ask user to use their join link instead
      return new Response(
        JSON.stringify({ error: 'Multiple accounts found. Please use your join link instead.' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const profile = profiles[0]

    // Get property name for context
    const { data: membership } = await admin
      .from('property_members')
      .select('properties(name)')
      .eq('user_id', profile.id)
      .eq('status', 'approved')
      .maybeSingle()

    return new Response(
      JSON.stringify({
        email: profile.email,
        userName: profile.full_name,
        propertyName: membership?.properties?.name || 'your property',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )

  } catch (err) {
    console.error('lookup-pin-user: unhandled error', err)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
