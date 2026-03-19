// LANDMAN — IoT Sensor Ingest Edge Function
// POST https://<project>.supabase.co/functions/v1/ingest/{property_id}/{platform}
//
// Accepts webhook payloads from IoT platforms (TTN, Blues Wireless, HTTP).
// Each property has its own webhook URL and auth token, managed via the
// manage-integration Edge Function.
//
// URL scheme:
//   /functions/v1/ingest/{property_id}/{platform}
//   e.g. /functions/v1/ingest/a1b2c3d4-..../ttn
//
// Auth: Bearer token validated against SHA-256 hash in property_integrations.
//
// Required env vars (auto-provided by Supabase runtime):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

// SHA-256 hash a string, return hex
async function hashToken(token: string): Promise<string> {
  const encoded = new TextEncoder().encode(token)
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req: Request) => {
  // ── CORS preflight ────────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // ── Always return 200 to prevent IoT network retries ──────────────
  // We capture any errors internally; the network must never see a 4xx/5xx.
  try {
    // ── Parse URL path: /ingest/{property_id}/{platform} ────────────
    const url = new URL(req.url)
    const pathParts = url.pathname.replace(/^\/+|\/+$/g, '').split('/')
    // Path will be like: ["ingest", "{property_id}", "{platform}"]
    // Find "ingest" in the path and take the next two segments
    const ingestIdx = pathParts.indexOf('ingest')
    const propertyId = ingestIdx >= 0 ? pathParts[ingestIdx + 1] : undefined
    const platform   = ingestIdx >= 0 ? pathParts[ingestIdx + 2] : undefined

    if (!propertyId || !platform) {
      console.warn('ingest: missing property_id or platform in URL path')
      return new Response('ok', { status: 200 })
    }

    const validPlatforms = ['ttn', 'blues', 'http']
    if (!validPlatforms.includes(platform)) {
      console.warn(`ingest: unknown platform "${platform}"`)
      return new Response('ok', { status: 200 })
    }

    // ── Supabase client (service role — bypasses RLS) ─────────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── Auth: validate per-property webhook token ───────────────────
    const authHeader = req.headers.get('Authorization') ?? ''
    const bearerToken = authHeader.replace('Bearer ', '').trim()
    if (!bearerToken) {
      console.warn('ingest: missing bearer token')
      return new Response('ok', { status: 200 })
    }

    const tokenHash = await hashToken(bearerToken)
    const { data: integration } = await supabase
      .from('property_integrations')
      .select('id, property_id, platform, enabled, message_count')
      .eq('property_id', propertyId)
      .eq('platform', platform)
      .eq('webhook_token', tokenHash)
      .eq('enabled', true)
      .maybeSingle()

    if (!integration) {
      console.warn(`ingest: unauthorized — no matching integration for property ${propertyId} / ${platform}`)
      return new Response('ok', { status: 200 })
    }

    // ── Parse body ────────────────────────────────────────────────
    const body = await req.json()

    // ── Extract device ID (platform-specific) ───────────────────────
    const devEui = extractDeviceId(body, platform)
    if (!devEui) {
      console.warn(`ingest: could not extract device ID from ${platform} payload`, JSON.stringify(body).slice(0, 200))
      return new Response('ok', { status: 200 })
    }

    // ── Look up or auto-register device ───────────────────────────
    let { data: device } = await supabase
      .from('devices')
      .select('id, device_type_id, active, property_id')
      .eq('dev_eui', devEui)
      .maybeSingle()

    if (!device) {
      console.log(`ingest: unknown device ${devEui} on ${platform} — auto-registering for property ${propertyId}`)
      const { data: newDevice, error: insertErr } = await supabase
        .from('devices')
        .insert({
          dev_eui: devEui,
          name: `Unknown ${devEui.slice(-6).toUpperCase()}`,
          active: false,
          property_id: propertyId,
          metadata: { auto_registered: true, first_seen: new Date().toISOString(), platform },
        })
        .select('id, device_type_id, active, property_id')
        .single()

      if (insertErr) {
        console.error('ingest: failed to auto-register device', insertErr)
        return new Response('ok', { status: 200 })
      }
      device = newDevice
    } else if (!device.property_id) {
      // Existing device with no property — adopt it
      await supabase
        .from('devices')
        .update({ property_id: propertyId })
        .eq('id', device.id)
      device.property_id = propertyId
    }

    // ── Handle TTN location_solved webhooks (sent separately) ───────
    if (platform === 'ttn') {
      const locSolved = (body?.location_solved ?? body?.data?.location_solved) as Record<string, unknown> | undefined
      if (locSolved) {
        const loc = locSolved.location as Record<string, unknown> | undefined
        if (loc?.latitude != null && loc?.longitude != null) {
          const lat = Number(loc.latitude)
          const lng = Number(loc.longitude)
          const { error: locErr } = await supabase
            .from('sensor_readings')
            .update({ lat, lng })
            .eq('device_id', device.id)
            .is('lat', null)
            .order('received_at', { ascending: false })
            .limit(1)
          if (locErr) {
            console.error(`ingest: failed to update location for ${devEui}`, locErr)
          } else {
            console.log(`ingest: location_solved for ${devEui} → ${lat},${lng}`)
          }
        }
        // Update integration counters even for location_solved
        await supabase
          .from('property_integrations')
          .update({ last_message_at: new Date().toISOString(), message_count: (integration.message_count ?? 0) + 1 })
          .eq('id', integration.id)
        return new Response('ok', { status: 200 })
      }
    }

    // ── Parse normalised fields (platform & device-type-specific) ───
    const parsed = platform === 'blues'
      ? parseBluesPayload(body)
      : parseTtnPayload(body, device.device_type_id)

    // ── Extract gateway info (TTN only) ─────────────────────────────
    const gatewayIds = platform === 'ttn' ? extractGatewayIds(body) : []
    const primaryGateway = gatewayIds[0]?.eui ?? gatewayIds[0]?.gatewayId ?? null

    // ── Insert sensor reading ─────────────────────────────────────
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
        gateway_id:  primaryGateway,
      })

    if (readingErr) {
      console.error('ingest: failed to insert reading', readingErr)
    } else {
      const fixInfo = parsed.lat != null ? `GPS ${parsed.lat},${parsed.lng}` : 'No GPS fix'
      const batInfo = parsed.battery_pct != null ? ` bat=${parsed.battery_pct}%` : ''
      console.log(`ingest: [${platform}] saved reading for ${devEui} (${device.active ? 'active' : 'unregistered'}) [${fixInfo}${batInfo}]${primaryGateway ? ` via gw ${primaryGateway}` : ''}`)
    }

    // ── Update integration counters ─────────────────────────────────
    await supabase
      .from('property_integrations')
      .update({
        last_message_at: new Date().toISOString(),
        message_count: (integration.message_count ?? 0) + 1,
      })
      .eq('id', integration.id)

    // ── Auto-discover routing devices (gateways) from TTN rx_metadata
    if (gatewayIds.length > 0) {
      if (!_routingTypeId) {
        const { data: gwType } = await supabase
          .from('device_types')
          .select('id')
          .eq('category', 'routing')
          .eq('protocol', 'lorawan')
          .maybeSingle()
        _routingTypeId = gwType?.id ?? null
      }

      const gwPropertyId = device.property_id ?? propertyId

      for (const gw of gatewayIds) {
        const gwDevEui = gw.eui ?? gw.gatewayId
        if (_knownGateways.has(gwDevEui)) continue

        const { data: existing } = await supabase
          .from('devices')
          .select('id, property_id')
          .eq('dev_eui', gwDevEui)
          .maybeSingle()

        if (!existing) {
          const { error: gwErr } = await supabase
            .from('devices')
            .insert({
              dev_eui: gwDevEui,
              device_type_id: _routingTypeId,
              property_id: gwPropertyId,
              name: `Gateway ${gw.gatewayId.slice(-6).toUpperCase()}`,
              active: false,
              metadata: {
                auto_registered: true,
                first_seen: new Date().toISOString(),
                source: 'rx_metadata',
                gateway_id: gw.gatewayId,
                eui: gw.eui,
              },
            })
          if (gwErr && gwErr.code !== '23505') {
            console.error(`ingest: failed to auto-register gateway ${gwDevEui}`, gwErr)
          } else {
            console.log(`ingest: auto-discovered gateway ${gwDevEui} (gw_id: ${gw.gatewayId})`)
          }
        } else if (!existing.property_id && gwPropertyId) {
          await supabase
            .from('devices')
            .update({ property_id: gwPropertyId })
            .eq('id', existing.id)
        }
        _knownGateways.add(gwDevEui)
      }
    }

    return new Response('ok', { status: 200 })

  } catch (err) {
    console.error('ingest: unhandled error', err)
    return new Response('ok', { status: 200 })  // always 200
  }
})


// ── Module-level cache for gateway discovery (persists across warm invocations)
let _knownGateways = new Set<string>()
let _routingTypeId: string | null = null


// ══════════════════════════════════════════════════════════════════════════
// DEVICE ID EXTRACTION (platform-specific)
// ══════════════════════════════════════════════════════════════════════════

function extractDeviceId(body: Record<string, unknown>, platform: string): string | null {
  if (platform === 'ttn')   return extractTtnDevEui(body)
  if (platform === 'blues') return extractBluesDeviceId(body)
  // 'http' — generic fallback
  return extractGenericDeviceId(body)
}

function extractTtnDevEui(body: Record<string, unknown>): string | null {
  // TTN v3: payload wrapped under body.data (standard TTN webhook format)
  const ttnData = body?.data as Record<string, unknown> | undefined
  const ttnIds  = ttnData?.end_device_ids as Record<string, unknown> | undefined
  if (ttnIds?.dev_eui) return String(ttnIds.dev_eui).toLowerCase()

  // TTN v3: legacy flat format (some integrations skip the data wrapper)
  const flatIds = body?.end_device_ids as Record<string, unknown> | undefined
  if (flatIds?.dev_eui) return String(flatIds.dev_eui).toLowerCase()

  return null
}

function extractBluesDeviceId(body: Record<string, unknown>): string | null {
  // Blues Notehub route payload: { device: "dev:864475XXXXXXXXX", ... }
  if (body?.device) return String(body.device).toLowerCase()
  // Fallback: serial number
  if (body?.sn) return String(body.sn).toLowerCase()
  return null
}

function extractGenericDeviceId(body: Record<string, unknown>): string | null {
  if (body?.dev_eui)    return String(body.dev_eui).toLowerCase()
  if (body?.device_eui) return String(body.device_eui).toLowerCase()
  if (body?.deviceEui)  return String(body.deviceEui).toLowerCase()
  if (body?.device_id)  return String(body.device_id).toLowerCase()
  return null
}


// ══════════════════════════════════════════════════════════════════════════
// GATEWAY EXTRACTION (TTN only)
// ══════════════════════════════════════════════════════════════════════════

interface GatewayInfo {
  gatewayId: string
  eui: string | null
  rssi: number | null
  snr: number | null
}

function extractGatewayIds(body: Record<string, unknown>): GatewayInfo[] {
  const ttnData = body?.data as Record<string, unknown> | undefined
  const ttnMsg  = (ttnData?.uplink_message ?? body?.uplink_message) as Record<string, unknown> | undefined
  const rxMeta  = ttnMsg?.rx_metadata as Record<string, unknown>[] | undefined
  if (!rxMeta?.length) return []

  return rxMeta
    .filter((m) => m?.gateway_ids)
    .map((m) => {
      const gwIds = m.gateway_ids as Record<string, unknown>
      return {
        gatewayId: String(gwIds.gateway_id ?? gwIds.eui ?? '').toLowerCase(),
        eui: gwIds.eui ? String(gwIds.eui).toLowerCase() : null,
        rssi: m.rssi != null ? Number(m.rssi) : null,
        snr: m.snr != null ? Number(m.snr) : null,
      }
    })
    .filter((g) => g.gatewayId)
    .sort((a, b) => (b.rssi ?? -999) - (a.rssi ?? -999)) // strongest first
}


// ══════════════════════════════════════════════════════════════════════════
// PAYLOAD PARSERS
// ══════════════════════════════════════════════════════════════════════════

interface ParsedReading {
  device_time?: string | null
  lat?:         number | null
  lng?:         number | null
  battery_pct?: number | null
  rssi?:        number | null
  snr?:         number | null
  extra?:       Record<string, unknown> | null
}


// ── Blues Wireless parser ────────────────────────────────────────────────
// Notehub route payloads: { device, body, best_location, voltage, when, ... }

function parseBluesPayload(body: Record<string, unknown>): ParsedReading {
  const sensorBody = body?.body as Record<string, unknown> | undefined
  const bestLoc = body?.best_location as Record<string, unknown> | undefined

  // GPS from best_location
  let lat: number | null = null
  let lng: number | null = null
  if (bestLoc?.lat != null && bestLoc?.lon != null) {
    lat = Number(bestLoc.lat)
    lng = Number(bestLoc.lon)
  }

  // Battery: Blues reports voltage (typical LiPo 2.5–4.2V range)
  let battery_pct: number | null = null
  if (body?.voltage != null) {
    const v = Number(body.voltage)
    battery_pct = Math.max(0, Math.min(100, Math.round(((v - 2.5) / 1.7) * 100)))
  }

  // Timestamp
  const device_time = body?.when != null
    ? new Date(Number(body.when) * 1000).toISOString()
    : null

  // RSSI / SNR from Blues tower metadata (if available)
  const rssi = body?.rssi != null ? Number(body.rssi) : null
  const snr  = body?.snr  != null ? Number(body.snr)  : null

  // Extra: all sensor body fields + location type
  const extra: Record<string, unknown> = {}
  if (sensorBody) {
    for (const [k, v] of Object.entries(sensorBody)) {
      extra[k] = v
    }
  }
  if (body?.best_location_type) extra.location_type = body.best_location_type
  if (body?.best_location_when) extra.location_when = body.best_location_when

  return {
    device_time,
    lat, lng,
    battery_pct,
    rssi, snr,
    extra: Object.keys(extra).length ? extra : null,
  }
}


// ── TTN payload parser ──────────────────────────────────────────────────
// Pattern-matched by decoded_payload field names so auto-registered devices
// (no type yet) still parse correctly. Ordered most-specific first.
// Field names sourced from TTN Device Repository codec YAML definitions.

// Helper: estimate battery % from Dragino voltage (typical 2.5–3.6V range)
function draginoBatPct(dp: Record<string, unknown>): number | null {
  const v = dp?.Bat != null ? Number(dp.Bat) : null
  if (v == null) return null
  return Math.min(Math.round(((v - 2.5) / 1.1) * 100), 100)
}

function parseTtnPayload(body: Record<string, unknown>, deviceTypeId: string | null): ParsedReading {
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

  if (dp) {
    // ── Dragino LSE01: soil moisture/EC/temperature ───────────────
    // Fields: conduct_SOIL, water_SOIL, temp_SOIL, Bat (voltage)
    if (dp.water_SOIL != null || dp.conduct_SOIL != null) {
      const extra: Record<string, unknown> = {}
      if (dp.water_SOIL   != null) extra.soil_moisture_pct  = Number(dp.water_SOIL)
      if (dp.temp_SOIL    != null) extra.soil_temperature_c  = Number(dp.temp_SOIL)
      if (dp.conduct_SOIL != null) extra.soil_ec             = Number(dp.conduct_SOIL)
      return {
        device_time: rxTime, rssi, snr,
        battery_pct: draginoBatPct(dp),
        extra: Object.keys(extra).length ? extra : null,
      }
    }

    // ── Dragino LDDS75: water level (ultrasonic distance) ─────────
    // Fields: distance_mm, Bat
    if (dp.distance_mm != null) {
      return {
        device_time: rxTime, rssi, snr,
        battery_pct: draginoBatPct(dp),
        extra: { water_level_mm: Number(dp.distance_mm) },
      }
    }

    // ── Dragino LDS02: door/gate open/close ───────────────────────
    // Fields: DOOR_OPEN_STATUS, LAST_DOOR_OPEN_DURATION, Bat
    if (dp.DOOR_OPEN_STATUS != null) {
      return {
        device_time: rxTime, rssi, snr,
        battery_pct: draginoBatPct(dp),
        extra: {
          door_open: Number(dp.DOOR_OPEN_STATUS) === 1,
          open_duration_s: dp.LAST_DOOR_OPEN_DURATION != null ? Number(dp.LAST_DOOR_OPEN_DURATION) : 0,
        },
      }
    }

    // ── RAK 7200 / Digitanimal: latitude/longitude style GPS ──────
    // Fields: latitude, longitude, battery (0-100)
    if (dp.latitude != null && dp.longitude != null) {
      const extra: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(dp)) {
        if (!['latitude', 'longitude', 'battery'].includes(k)) extra[k] = v
      }
      return {
        device_time: rxTime, rssi, snr,
        lat: Number(dp.latitude),
        lng: Number(dp.longitude),
        battery_pct: dp.battery != null ? Number(dp.battery) : null,
        extra: Object.keys(extra).length ? extra : null,
      }
    }

    // ── Dragino LHT65N / Browan / LSN50v2: temp & humidity ────────
    // Fields: TempC_SHT, Hum_SHT, Bat
    if (dp.TempC_SHT != null || dp.Hum_SHT != null) {
      const extra: Record<string, unknown> = {}
      if (dp.TempC_SHT != null) extra.temperature_c = Number(dp.TempC_SHT)
      if (dp.Hum_SHT   != null) extra.humidity_pct  = Number(dp.Hum_SHT)
      return {
        device_time: rxTime, rssi, snr,
        battery_pct: draginoBatPct(dp),
        extra: Object.keys(extra).length ? extra : null,
      }
    }

    // ── Weather station: wind, rain, solar ────────────────────────
    // Fields: wind_speed, rainfall, solar_radiation, temperature, humidity
    if (dp.wind_speed != null || dp.rainfall != null) {
      const extra: Record<string, unknown> = {}
      if (dp.wind_speed       != null) extra.wind_speed_kmh  = Number(dp.wind_speed)
      if (dp.rainfall         != null) extra.rainfall_mm      = Number(dp.rainfall)
      if (dp.solar_radiation  != null) extra.solar_radiation   = Number(dp.solar_radiation)
      if (dp.temperature      != null) extra.temperature_c     = Number(dp.temperature)
      if (dp.humidity         != null) extra.humidity_pct       = Number(dp.humidity)
      return {
        device_time: rxTime, rssi, snr,
        extra: Object.keys(extra).length ? extra : null,
      }
    }

    // ── Seeed SenseCAP T1000-E ───────────────────────────────────
    // MUST come before trail camera check — SenseCAP payloads include
    // a `motion` object ({ count, detected }) which would false-match
    // the trail camera's simple `motion` boolean check.
    // Older codec: has_fix (bool), lat, lon, battery_pct, ic_temp_c
    // Newer codec: fix_tech ("gnss"|"wifi"|"ble"|"none"), device_type: "sensecap_t1000",
    //              battery_pct, battery_v — coordinates in uplink_message.locations
    if (dp.device_type === 'sensecap_t1000' || dp.has_fix != null || (dp.battery_pct != null && dp.fix_tech != null)) {
      const fixTech = dp.fix_tech as string | undefined
      const hasFix = dp.has_fix === true || (fixTech != null && fixTech !== 'none' && fixTech !== '')
      let lat: number | null = null
      let lng: number | null = null

      if (hasFix) {
        lat = dp.lat != null ? Number(dp.lat) : (dp.latitude != null ? Number(dp.latitude) : null)
        lng = dp.lon != null ? Number(dp.lon) : (dp.longitude != null ? Number(dp.longitude) : null)
      }

      // Fallback: coordinates in uplink_message.locations (newer codec + TTN location solving)
      if ((lat === null || lng === null) && ttnMsg?.locations) {
        const locs = ttnMsg.locations as Record<string, Record<string, unknown>>
        const frmLoc = locs?.['frm-payload']
        if (frmLoc?.latitude != null && frmLoc?.longitude != null) {
          lat = Number(frmLoc.latitude)
          lng = Number(frmLoc.longitude)
        }
      }

      const bat = dp.battery_pct != null ? Number(dp.battery_pct) : null

      if (lat !== null || lng !== null || bat !== null) {
        const extra: Record<string, unknown> = {}
        if (dp.ic_temp_c != null) extra.temperature_c = Number(dp.ic_temp_c)
        if (dp.has_fix   != null) extra.has_fix       = dp.has_fix
        if (fixTech      != null) extra.fix_tech      = fixTech
        const skipKeys = ['lat', 'lon', 'latitude', 'longitude', 'battery_pct', 'ic_temp_c', 'has_fix', 'fix_tech', 'device_type', 'battery_v']
        for (const [k, v] of Object.entries(dp)) {
          if (!skipKeys.includes(k)) extra[k] = v
        }
        return {
          device_time: rxTime, lat, lng,
          battery_pct: bat, rssi, snr,
          extra: Object.keys(extra).length ? extra : null,
        }
      }
    }

    // ── Trail camera: motion events ───────────────────────────────
    // Fields: motion (boolean), trigger_count — NOT an object like SenseCAP's motion
    if ((typeof dp.motion === 'boolean' || typeof dp.motion === 'number') || dp.trigger_count != null) {
      const extra: Record<string, unknown> = {}
      if (dp.motion        != null) extra.motion_detected = Boolean(dp.motion)
      if (dp.trigger_count != null) extra.trigger_count    = Number(dp.trigger_count)
      return {
        device_time: rxTime, rssi, snr,
        extra: Object.keys(extra).length ? extra : null,
      }
    }

    // ── Generic: unknown device with decoded_payload ──────────────
    // Store all decoded fields in extra for manual inspection
    if (Object.keys(dp).length > 0) {
      const extra: Record<string, unknown> = { ...dp }
      return { device_time: rxTime, rssi, snr, extra }
    }
  }

  // ── No decoded payload / raw only ──────────────────────────────
  return { device_time: rxTime, rssi, snr }
}
