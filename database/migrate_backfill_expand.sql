-- ──────────────────────────────────────────────────────────────────────────
-- LANDMAN: Expanded backfill_device_readings
-- Run in Supabase SQL Editor after migrate_backfill.sql
--
-- Replaces the backfill function with an expanded version that handles
-- multiple device payload patterns (not just SenseCAP T1000-E).
-- Pattern-matched by decoded_payload field names so it works regardless
-- of whether a device_type_id has been assigned.
--
-- Also populates gateway_id from rx_metadata (requires migrate_routing.sql).
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION backfill_device_readings(p_device_id UUID)
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER := 0;
  r             RECORD;
  v_msg         JSONB;
  v_dp          JSONB;
  v_lat         DOUBLE PRECISION;
  v_lng         DOUBLE PRECISION;
  v_bat         SMALLINT;
  v_rssi        SMALLINT;
  v_snr         REAL;
  v_extra       JSONB;
  v_has_fix     BOOLEAN;
  v_gateway_id  TEXT;
  v_matched     BOOLEAN;
BEGIN
  FOR r IN
    SELECT id, raw
    FROM   sensor_readings
    WHERE  device_id = p_device_id
      AND  (lat IS NULL OR battery_pct IS NULL OR rssi IS NULL)
  LOOP
    -- Support both TTN data-wrapped format and flat format
    v_msg := COALESCE(
      r.raw->'data'->'uplink_message',
      r.raw->'uplink_message'
    );

    IF v_msg IS NULL THEN CONTINUE; END IF;

    v_dp        := v_msg->'decoded_payload';
    v_lat       := NULL;
    v_lng       := NULL;
    v_bat       := NULL;
    v_rssi      := NULL;
    v_snr       := NULL;
    v_extra     := NULL;
    v_gateway_id := NULL;
    v_matched   := FALSE;

    -- ── Common: RSSI / SNR from first rx_metadata entry ──────────
    v_rssi := (v_msg->'rx_metadata'->0->>'rssi')::SMALLINT;
    v_snr  := (v_msg->'rx_metadata'->0->>'snr')::REAL;

    -- ── Common: gateway_id from strongest rx_metadata entry ──────
    v_gateway_id := LOWER(v_msg->'rx_metadata'->0->'gateway_ids'->>'gateway_id');

    IF v_dp IS NOT NULL THEN

      -- ── Pattern: Dragino soil sensor (LSE01) ────────────────────
      -- Fields: conduct_SOIL, water_SOIL, temp_SOIL
      IF v_dp ? 'water_SOIL' OR v_dp ? 'conduct_SOIL' THEN
        v_extra := '{}'::JSONB;
        IF v_dp->>'water_SOIL' IS NOT NULL THEN
          v_extra := v_extra || jsonb_build_object('soil_moisture_pct', (v_dp->>'water_SOIL')::NUMERIC);
        END IF;
        IF v_dp->>'temp_SOIL' IS NOT NULL THEN
          v_extra := v_extra || jsonb_build_object('soil_temperature_c', (v_dp->>'temp_SOIL')::NUMERIC);
        END IF;
        IF v_dp->>'conduct_SOIL' IS NOT NULL THEN
          v_extra := v_extra || jsonb_build_object('soil_ec', (v_dp->>'conduct_SOIL')::NUMERIC);
        END IF;
        IF v_dp->>'Bat' IS NOT NULL THEN
          v_bat := LEAST(ROUND((v_dp->>'Bat')::NUMERIC / 3.7 * 100), 100)::SMALLINT;
        END IF;
        IF v_extra = '{}'::JSONB THEN v_extra := NULL; END IF;
        v_matched := TRUE;

      -- ── Pattern: Dragino water level sensor (LDDS75) ────────────
      -- Fields: distance_mm
      ELSIF v_dp ? 'distance_mm' THEN
        v_extra := jsonb_build_object('water_level_mm', (v_dp->>'distance_mm')::NUMERIC);
        IF v_dp->>'Bat' IS NOT NULL THEN
          v_bat := LEAST(ROUND((v_dp->>'Bat')::NUMERIC / 3.7 * 100), 100)::SMALLINT;
        END IF;
        v_matched := TRUE;

      -- ── Pattern: Dragino door sensor (LDS02) ───────────────────
      -- Fields: DOOR_OPEN_STATUS, LAST_DOOR_OPEN_DURATION
      ELSIF v_dp ? 'DOOR_OPEN_STATUS' THEN
        v_extra := jsonb_build_object(
          'door_open', (v_dp->>'DOOR_OPEN_STATUS')::INTEGER = 1,
          'open_duration_s', COALESCE((v_dp->>'LAST_DOOR_OPEN_DURATION')::NUMERIC, 0)
        );
        IF v_dp->>'Bat' IS NOT NULL THEN
          v_bat := LEAST(ROUND((v_dp->>'Bat')::NUMERIC / 3.7 * 100), 100)::SMALLINT;
        END IF;
        v_matched := TRUE;

      -- ── Pattern: RAK 7200 / Digitanimal (latitude/longitude) ───
      -- Fields: latitude, longitude, battery
      ELSIF v_dp ? 'latitude' AND v_dp ? 'longitude' THEN
        v_lat := (v_dp->>'latitude')::DOUBLE PRECISION;
        v_lng := (v_dp->>'longitude')::DOUBLE PRECISION;
        IF v_dp->>'battery' IS NOT NULL THEN
          v_bat := (v_dp->>'battery')::SMALLINT;
        END IF;
        v_matched := TRUE;

      -- ── Pattern: Temp/humidity (Dragino LHT65N, Browan, LSN50v2)
      -- Fields: TempC_SHT, Hum_SHT
      ELSIF v_dp ? 'TempC_SHT' OR v_dp ? 'Hum_SHT' THEN
        v_extra := '{}'::JSONB;
        IF v_dp->>'TempC_SHT' IS NOT NULL THEN
          v_extra := v_extra || jsonb_build_object('temperature_c', (v_dp->>'TempC_SHT')::NUMERIC);
        END IF;
        IF v_dp->>'Hum_SHT' IS NOT NULL THEN
          v_extra := v_extra || jsonb_build_object('humidity_pct', (v_dp->>'Hum_SHT')::NUMERIC);
        END IF;
        IF v_dp->>'Bat' IS NOT NULL THEN
          v_bat := LEAST(ROUND((v_dp->>'Bat')::NUMERIC / 3.7 * 100), 100)::SMALLINT;
        END IF;
        IF v_extra = '{}'::JSONB THEN v_extra := NULL; END IF;
        v_matched := TRUE;

      -- ── Pattern: Weather station (wind_speed, rainfall) ─────────
      ELSIF v_dp ? 'wind_speed' OR v_dp ? 'rainfall' THEN
        v_extra := '{}'::JSONB;
        IF v_dp->>'wind_speed' IS NOT NULL THEN
          v_extra := v_extra || jsonb_build_object('wind_speed_kmh', (v_dp->>'wind_speed')::NUMERIC);
        END IF;
        IF v_dp->>'rainfall' IS NOT NULL THEN
          v_extra := v_extra || jsonb_build_object('rainfall_mm', (v_dp->>'rainfall')::NUMERIC);
        END IF;
        IF v_dp->>'solar_radiation' IS NOT NULL THEN
          v_extra := v_extra || jsonb_build_object('solar_radiation', (v_dp->>'solar_radiation')::NUMERIC);
        END IF;
        IF v_dp->>'temperature' IS NOT NULL THEN
          v_extra := v_extra || jsonb_build_object('temperature_c', (v_dp->>'temperature')::NUMERIC);
        END IF;
        IF v_dp->>'humidity' IS NOT NULL THEN
          v_extra := v_extra || jsonb_build_object('humidity_pct', (v_dp->>'humidity')::NUMERIC);
        END IF;
        IF v_extra = '{}'::JSONB THEN v_extra := NULL; END IF;
        v_matched := TRUE;

      -- ── Pattern: Trail camera (motion, trigger_count) ───────────
      ELSIF v_dp ? 'motion' OR v_dp ? 'trigger_count' THEN
        v_extra := '{}'::JSONB;
        IF v_dp->>'motion' IS NOT NULL THEN
          v_extra := v_extra || jsonb_build_object('motion_detected', (v_dp->>'motion')::BOOLEAN);
        END IF;
        IF v_dp->>'trigger_count' IS NOT NULL THEN
          v_extra := v_extra || jsonb_build_object('trigger_count', (v_dp->>'trigger_count')::INTEGER);
        END IF;
        IF v_extra = '{}'::JSONB THEN v_extra := NULL; END IF;
        v_matched := TRUE;

      -- ── Pattern: SenseCAP T1000-E (original) ───────────────────
      -- Fields: has_fix, lat, lon, battery_pct, ic_temp_c
      ELSIF v_dp ? 'battery_pct' OR v_dp ? 'has_fix' THEN
        v_bat := NULLIF(v_dp->>'battery_pct', 'null')::SMALLINT;
        v_has_fix := (NULLIF(v_dp->>'has_fix', 'null'))::BOOLEAN;
        IF v_has_fix IS TRUE THEN
          v_lat := NULLIF(v_dp->>'lat', 'null')::DOUBLE PRECISION;
          v_lng := NULLIF(v_dp->>'lon', 'null')::DOUBLE PRECISION;
        END IF;
        v_extra := '{}'::JSONB;
        IF NULLIF(v_dp->>'ic_temp_c', 'null') IS NOT NULL THEN
          v_extra := v_extra || jsonb_build_object('temperature_c', (v_dp->>'ic_temp_c')::NUMERIC);
        END IF;
        IF v_has_fix IS NOT NULL THEN
          v_extra := v_extra || jsonb_build_object('has_fix', v_has_fix);
        END IF;
        IF v_extra = '{}'::JSONB THEN v_extra := NULL; END IF;
        v_matched := TRUE;
      END IF;

    END IF;

    -- Fallback GPS: TTN network-estimated location from frm-payload
    IF v_lat IS NULL AND v_msg->'locations'->'frm-payload' IS NOT NULL THEN
      v_lat := (v_msg->'locations'->'frm-payload'->>'latitude')::DOUBLE PRECISION;
      v_lng := (v_msg->'locations'->'frm-payload'->>'longitude')::DOUBLE PRECISION;
    END IF;

    -- Only write the row if we extracted at least one new value
    IF v_lat IS NOT NULL OR v_bat IS NOT NULL OR v_rssi IS NOT NULL OR v_gateway_id IS NOT NULL THEN
      UPDATE sensor_readings SET
        lat         = COALESCE(v_lat,        lat),
        lng         = COALESCE(v_lng,        lng),
        battery_pct = COALESCE(v_bat,        battery_pct),
        rssi        = COALESCE(v_rssi,       rssi),
        snr         = COALESCE(v_snr,        snr),
        extra       = COALESCE(v_extra,      extra),
        gateway_id  = COALESCE(v_gateway_id, gateway_id)
      WHERE id = r.id;

      updated_count := updated_count + 1;
    END IF;
  END LOOP;

  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;
