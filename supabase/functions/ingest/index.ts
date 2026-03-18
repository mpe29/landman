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
      .select('id, device_type_id, active, property_id')
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
        .select('id, device_type_id, active, property_id')
        .single()

      if (insertErr) {
        console.error('ingest: failed to auto-register device', insertErr)
        return new Response('ok', { status: 200 })
      }
      device = newDevice
    }

    // ── Parse normalised fields (device-type-specific) ────────────
    const parsed = parsePayload(body, device.device_type_id)

    // ── Extract gateway info from rx_metadata ─────────────────────
    const gatewayIds = extractGatewayIds(body)
    const primaryGateway = gatewayIds[0]?.gatewayId ?? null

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
        gateway_id:  primaryGateway,
      })

    if (readingErr) {
      console.error('ingest: failed to insert reading', readingErr)
    } else {
      console.log(`ingest: saved reading for device ${devEui} (${device.active ? 'active' : 'unregistered'})${primaryGateway ? ` via gw ${primaryGateway}` : ''}`)
    }

    // ── Auto-discover routing devices (gateways) from rx_metadata ─
    if (gatewayIds.length > 0) {
      // Look up the 'LoRaWAN Gateway' routing device type (cached per warm instance)
      if (!_routingTypeId) {
        const { data: gwType } = await supabase
          .from('device_types')
          .select('id')
          .eq('category', 'routing')
          .eq('protocol', 'lorawan')
          .maybeSingle()
        _routingTypeId = gwType?.id ?? null
      }

      // Use reporting device's property_id so gateway passes RLS
      const gwPropertyId = device.property_id ?? null

      for (const gw of gatewayIds) {
        // Use EUI as the unique device identifier; fall back to gateway_id
        const gwDevEui = gw.eui ?? gw.gatewayId

        // Skip if we've already seen this gateway in this warm instance
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
          if (gwErr && gwErr.code !== '23505') { // 23505 = unique violation (race)
            console.error(`ingest: failed to auto-register gateway ${gwDevEui}`, gwErr)
          } else {
            console.log(`ingest: auto-discovered gateway ${gwDevEui} (gw_id: ${gw.gatewayId})`)
          }
        } else if (!existing.property_id && gwPropertyId) {
          // Gateway exists but has no property — adopt it into this property
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


// ── Gateway extraction ──────────────────────────────────────────────────────
// Parses rx_metadata from TTN uplinks to identify which gateways relayed
// the message. Returns sorted by RSSI descending (strongest first).

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


// ── Payload parsers ─────────────────────────────────────────────────────────
// Pattern-matched by decoded_payload field names so auto-registered devices
// (no type yet) still parse correctly. Ordered most-specific first.
// Field names sourced from TTN Device Repository codec YAML definitions.

interface ParsedReading {
  device_time?: string | null
  lat?:         number | null
  lng?:         number | null
  battery_pct?: number | null
  rssi?:        number | null
  snr?:         number | null
  extra?:       Record<string, unknown> | null
}

// Helper: estimate battery % from Dragino voltage (typical 2.5–3.6V range)
function draginoBatPct(dp: Record<string, unknown>): number | null {
  const v = dp?.Bat != null ? Number(dp.Bat) : null
  if (v == null) return null
  return Math.min(Math.round(((v - 2.5) / 1.1) * 100), 100)
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

    // ── Trail camera: motion events ───────────────────────────────
    // Fields: motion, trigger_count
    if (dp.motion != null || dp.trigger_count != null) {
      const extra: Record<string, unknown> = {}
      if (dp.motion        != null) extra.motion_detected = Boolean(dp.motion)
      if (dp.trigger_count != null) extra.trigger_count    = Number(dp.trigger_count)
      return {
        device_time: rxTime, rssi, snr,
        extra: Object.keys(extra).length ? extra : null,
      }
    }

    // ── Seeed SenseCAP T1000-E ───────────────────────────────────
    // Fields: has_fix, lat, lon, battery_pct, ic_temp_c
    if (dp.has_fix != null || dp.battery_pct != null) {
      const hasFix = dp.has_fix === true
      let lat: number | null = null
      let lng: number | null = null

      if (hasFix) {
        lat = dp.lat != null ? Number(dp.lat) : null
        lng = dp.lon != null ? Number(dp.lon) : null
      }

      // Fallback: TTN network-estimated location
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
        for (const [k, v] of Object.entries(dp)) {
          if (!['lat', 'lon', 'battery_pct', 'ic_temp_c', 'has_fix'].includes(k)) {
            extra[k] = v
          }
        }
        return {
          device_time: rxTime, lat, lng,
          battery_pct: bat, rssi, snr,
          extra: Object.keys(extra).length ? extra : null,
        }
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
