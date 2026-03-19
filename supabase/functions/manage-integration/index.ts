// LANDMAN — Manage Integration Edge Function
// POST https://<project>.supabase.co/functions/v1/manage-integration
//
// CRUD for property webhook integrations. Generates cryptographic tokens,
// stores only the SHA-256 hash, and returns the plaintext exactly once.
//
// Actions:
//   create  — { propertyId, platform, label? }  → { id, webhookUrl, token }
//   rotate  — { integrationId }                 → { id, webhookUrl, token }
//   delete  — { integrationId }                 → { success: true }
//
// Requires: authenticated user who is admin of the target property.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PROJECT_URL = 'https://scpcloowqevurdmuogio.supabase.co'

// Generate a cryptographically random 64-character hex token
function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

// SHA-256 hash a string, return hex
async function hashToken(token: string): Promise<string> {
  const encoded = new TextEncoder().encode(token)
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { action, propertyId, platform, label, integrationId } = await req.json()

    // ── Authenticate the caller ──────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return errorResponse('Missing authorization header', 401)
    }

    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: { user: caller } } = await callerClient.auth.getUser()
    if (!caller) {
      return errorResponse('Invalid auth token', 401)
    }

    // ── Service role client (bypasses RLS) ───────────────────────────
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── Helper: verify caller is admin of a property ─────────────────
    async function assertAdmin(propId: string): Promise<Response | null> {
      const { data: membership } = await admin
        .from('property_members')
        .select('is_admin')
        .eq('property_id', propId)
        .eq('user_id', caller!.id)
        .eq('status', 'approved')
        .eq('is_admin', true)
        .maybeSingle()

      if (!membership) {
        return errorResponse('You are not an admin of this property', 403)
      }
      return null
    }

    // ── CREATE ───────────────────────────────────────────────────────
    if (action === 'create') {
      if (!propertyId || !platform) {
        return errorResponse('propertyId and platform are required')
      }

      const validPlatforms = ['ttn', 'blues', 'http']
      if (!validPlatforms.includes(platform)) {
        return errorResponse(`Invalid platform. Must be one of: ${validPlatforms.join(', ')}`)
      }

      const adminCheck = await assertAdmin(propertyId)
      if (adminCheck) return adminCheck

      // Check for existing integration on this platform
      const { data: existing } = await admin
        .from('property_integrations')
        .select('id')
        .eq('property_id', propertyId)
        .eq('platform', platform)
        .maybeSingle()

      if (existing) {
        return errorResponse(`An integration for ${platform} already exists on this property. Delete it first or rotate the token.`)
      }

      const plainToken = generateToken()
      const hashedToken = await hashToken(plainToken)
      const prefix = plainToken.slice(0, 8)

      const { data: integration, error: insertErr } = await admin
        .from('property_integrations')
        .insert({
          property_id: propertyId,
          platform,
          label: label || null,
          webhook_token: hashedToken,
          webhook_token_prefix: prefix,
          created_by: caller.id,
        })
        .select('id, property_id, platform')
        .single()

      if (insertErr) {
        console.error('manage-integration: create failed', insertErr)
        return errorResponse('Failed to create integration', 500)
      }

      const webhookUrl = `${PROJECT_URL}/functions/v1/ingest/${propertyId}/${platform}`

      return jsonResponse({
        id: integration.id,
        webhookUrl,
        token: plainToken,
      })
    }

    // ── ROTATE ──────────────────────────────────────────────────────
    if (action === 'rotate') {
      if (!integrationId) {
        return errorResponse('integrationId is required')
      }

      // Look up the integration to get property_id
      const { data: integration } = await admin
        .from('property_integrations')
        .select('id, property_id, platform')
        .eq('id', integrationId)
        .maybeSingle()

      if (!integration) {
        return errorResponse('Integration not found', 404)
      }

      const adminCheck = await assertAdmin(integration.property_id)
      if (adminCheck) return adminCheck

      const plainToken = generateToken()
      const hashedToken = await hashToken(plainToken)
      const prefix = plainToken.slice(0, 8)

      const { error: updateErr } = await admin
        .from('property_integrations')
        .update({
          webhook_token: hashedToken,
          webhook_token_prefix: prefix,
        })
        .eq('id', integrationId)

      if (updateErr) {
        console.error('manage-integration: rotate failed', updateErr)
        return errorResponse('Failed to rotate token', 500)
      }

      const webhookUrl = `${PROJECT_URL}/functions/v1/ingest/${integration.property_id}/${integration.platform}`

      return jsonResponse({
        id: integration.id,
        webhookUrl,
        token: plainToken,
      })
    }

    // ── DELETE ───────────────────────────────────────────────────────
    if (action === 'delete') {
      if (!integrationId) {
        return errorResponse('integrationId is required')
      }

      // Look up the integration to get property_id
      const { data: integration } = await admin
        .from('property_integrations')
        .select('id, property_id')
        .eq('id', integrationId)
        .maybeSingle()

      if (!integration) {
        return errorResponse('Integration not found', 404)
      }

      const adminCheck = await assertAdmin(integration.property_id)
      if (adminCheck) return adminCheck

      const { error: deleteErr } = await admin
        .from('property_integrations')
        .delete()
        .eq('id', integrationId)

      if (deleteErr) {
        console.error('manage-integration: delete failed', deleteErr)
        return errorResponse('Failed to delete integration', 500)
      }

      return jsonResponse({ success: true })
    }

    return errorResponse(`Unknown action: ${action}. Must be create, rotate, or delete.`)

  } catch (err) {
    console.error('manage-integration: unhandled error', err)
    return errorResponse('Internal server error', 500)
  }
})
