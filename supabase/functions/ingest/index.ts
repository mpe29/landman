// LANDMAN — IoT Sensor Ingest Edge Function
// POST https://<project>.supabase.co/functions/v1/ingest
//
// Accepts webhook payloads from any LoRa/IoT network.
// Currently supports: TTN (The Things Network) v3
//
// Required env vars (set in Supabase Dashboard → Edge Functions → Secrets):
//   INGEST_SECRET   — shared bearer token; set the same value in TTN webhook headers
//   SUPABASE_URL    — auto-provided by Supabase runtime
//   SUPABASE_SERVICE_ROLE_KEY — auto-provided by Supabase runtime

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

Deno.serve(async (req: Request) => {
  // ── CORS preflight ────────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // ── Always return 200 to prevent LoRa network retries ─────────────
  // We capture any errors internally; the network must never see a 4xx/5xx.
  try {
    // ── Auth: validate shared bearer secret ───────────────────────
    const ingestSecret = Deno.env.get('INGEST_SECRET')
    if (ingestSecret) {
      const authHeader = req.headers.get('Authorization') ?? ''
      const token = authHeader.replace('Bearer ', '').trim()
      if (token !== ingestSecret) {
        console.warn('ingest: unauthorized request')
        return new Response('ok', { status: 200 })  // still 200 — don't reveal auth failure
      }
    }

    // ── Parse body ────────────────────────────────────────────────
    const body = await req.json()

    // ── Detect network / extract dev_eui ─────────────────────────
    // TTN v3 format: body.data.end_device_ids.dev_eui  (TTN wraps payload in a "data" key)
    // Also supports direct HTTP devices posting their own ID.
    const devEui = extractDevEui(body)
    if (!devEui) {
      console.warn('ingest: could not extract dev_eui from payload', JSON.stringify(body).slice(0, 200))
      return new Response('ok', { status: 200 })
    }

    // ── Supabase client (service role — bypasses RLS) ─────────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── Look up or auto-register device ───────────────────────────
    let { data: device } = await supabase
      .from('devices')
      .select('id, device_type_id, active')
      .eq('dev_eui', devEui)
      .maybeSingle()

    if (!device) {
      console.log(`ingest: unknown dev_eui ${devEui} — auto-registering`)
      const { data: newDevice, error: insertErr } = await supabase
        .from('devices')
        .insert({
          dev_eui: devEui,
          name: `Unknown ${devEui.slice(-6).toUpperCase()}`,
          active: false,
          metadata: { auto_registered: true, first_seen: new Date().toISOString() },
        })
        .select('id, device_type_id, active')
        .single()

      if (insertErr) {
        console.error('ingest: failed to auto-register device', insertErr)
        return new Response('ok', { status: 200 })
      }
      device = newDevice
    }

    // ── Parse normalised fields (device-type-specific) ────────────
    const parsed = parsePayload(body, device.device_type_id)

    // ── Insert sensor reading ─────────────────────────────────────
    // raw is always stored; parsed fields may be null if type unknown.
    const { error: readingErr } = await supabase
      .from('sensor_readings')
      .insert({
        device_id:   device.id,
        received_at: new Date().toISOString(),
        device_time: parsed.device_time ?? null,
        raw:         body,
        lat:         parsed.lat    ?? null,
        lng:         parsed.lng    ?? null,
        battery_pct: parsed.battery_pct ?? null,
        rssi:        parsed.rssi   ?? null,
        snr:         parsed.snr    ?? null,
        extra:       parsed.extra  ?? null,
      })

    if (readingErr) {
      console.error('ingest: failed to insert reading', readingErr)
    } else {
      console.log(`ingest: saved reading for device ${devEui} (${device.active ? 'active' : 'unregistered'})`)
    }

    return new Response('ok', { status: 200 })

  } catch (err) {
    console.error('ingest: unhandled error', err)
    return new Response('ok', { status: 200 })  // always 200
  }
})


// ── dev_eui extraction ──────────────────────────────────────────────────────
// Add a new network block here when you connect a new network/platform.

function extractDevEui(body: Record<string, unknown>): string | null {
  // TTN v3: payload wrapped under body.data (standard TTN webhook format)
  const ttnData = body?.data as Record<string, unknown> | undefined
  const ttnIds  = ttnData?.end_device_ids as Record<string, unknown> | undefined
  if (ttnIds?.dev_eui) return String(ttnIds.dev_eui).toLowerCase()

  // TTN v3: legacy flat format (some integrations skip the data wrapper)
  const flatIds = body?.end_device_ids as Record<string, unknown> | undefined
  if (flatIds?.dev_eui) return String(flatIds.dev_eui).toLowerCase()

  // Direct HTTP (custom devices posting their own ID)
  if (body?.dev_eui)    return String(body.dev_eui).toLowerCase()
  if (body?.device_eui) return String(body.device_eui).toLowerCase()
  if (body?.deviceEui)  return String(body.deviceEui).toLowerCase()

  return null
}


// ── Payload parsers ─────────────────────────────────────────────────────────
// One block per device type. device_type_id is the UUID from the device_types
// table. Keep this list short — one parser per hardware model is enough.
// All fields are optional; return null for anything not present.

interface ParsedReading {
  device_time?: string | null
  lat?:         number | null
  lng?:         number | null
  battery_pct?: number | null
  rssi?:        number | null
  snr?:         number | null
  extra?:       Record<string, unknown> | null
}

function parsePayload(body: Record<string, unknown>, deviceTypeId: string | null): ParsedReading {
  // TTN v3 wraps the actual message under body.data
  const ttnData = body?.data as Record<string, unknown> | undefined
  const ttnMsg  = (ttnData?.uplink_message ?? body?.uplink_message) as Record<string, unknown> | undefined

  // rx_metadata: signal quality from the receiving gateway
  const rxMeta  = (ttnMsg?.rx_metadata as Record<string, unknown>[])?.[0]
  const rssi    = rxMeta?.rssi != null ? Number(rxMeta.rssi) : null
  const snr     = rxMeta?.snr  != null ? Number(rxMeta.snr)  : null
  const rxTime  = ttnMsg?.received_at as string | undefined

  // Decoded payload from TTN codec (device firmware + TTN formatter)
  const dp = ttnMsg?.decoded_payload as Record<string, unknown> | undefined

  // ── Seeed SenseCAP T1000-E ─────────────────────────────────────
  // Real T1000 decoded_payload fields:
  //   lat, lon (float, degrees) — present when has_fix=true
  //   battery_pct (integer 0-100)
  //   ic_temp_c (float, internal chip temperature)
  //   has_fix (boolean)
  if (dp) {
    // Prefer GPS fix from decoded payload
    const hasFix = dp?.has_fix === true
    let lat: number | null = null
    let lng: number | null = null

    if (hasFix) {
      lat = dp?.lat != null ? Number(dp.lat) : null
      lng = dp?.lon != null ? Number(dp.lon) : null
    }

    // Fallback: TTN network-estimated location (geolocation service)
    // Present in uplink_message.locations["frm-payload"] even when has_fix=false
    if ((lat === null || lng === null) && ttnMsg?.locations) {
      const locs = ttnMsg.locations as Record<string, Record<string, unknown>>
      const frmLoc = locs?.['frm-payload']
      if (frmLoc?.latitude != null && frmLoc?.longitude != null) {
        lat = Number(frmLoc.latitude)
        lng = Number(frmLoc.longitude)
      }
    }

    const bat = dp?.battery_pct != null ? Number(dp.battery_pct) : null

    if (lat !== null || lng !== null || bat !== null) {
      const extra: Record<string, unknown> = {}
      if (dp.ic_temp_c   != null) extra.temperature_c = Number(dp.ic_temp_c)
      if (dp.has_fix     != null) extra.has_fix        = dp.has_fix
      // Preserve any other fields the codec emits
      for (const [k, v] of Object.entries(dp)) {
        if (!['lat', 'lon', 'battery_pct', 'ic_temp_c', 'has_fix'].includes(k)) {
          extra[k] = v
        }
      }

      return {
        device_time: rxTime,
        lat,
        lng,
        battery_pct: bat,
        rssi,
        snr,
        extra: Object.keys(extra).length ? extra : null,
      }
    }
  }

  // ── Unknown / raw only ────────────────────────────────────────
  return { device_time: rxTime, rssi, snr }
}
