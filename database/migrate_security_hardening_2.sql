-- ══════════════════════════════════════════════════════════════════════════
-- LANDMAN: Security Hardening (Part 2)
-- Fixes remaining Security Advisor warnings after part 1:
--   1. Drop old function overloads (create_observation with json param)
--   2. Add SET search_path to backfill_device_readings
--   3. Fix overly permissive RLS policies on observation_tag_types/tags
--
-- Run in Supabase SQL Editor after migrate_security_hardening.sql
-- ══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────
-- 1. DROP OLD FUNCTION OVERLOADS
--    Old migrations created create_observation with p_geom as JSON (not JSONB).
--    PostgreSQL treats json vs jsonb as different types → separate overloaded
--    functions. The old overloads lack SET search_path and SECURITY DEFINER.
-- ─────────────────────────────────────────────────────────────────────────

-- Old create_observation: (uuid, uuid, json, timestamptz, text, text, text) → json
-- From migrate_observations.sql — 7 params, p_geom was json, returned json
DROP FUNCTION IF EXISTS create_observation(uuid, uuid, json, timestamptz, text, text, text);

-- Old create_observation: (uuid, uuid, jsonb, timestamptz, text, text, text, integer) → uuid
-- From migrate_bearing.sql — 8 params, had bearing but not image_hash
DROP FUNCTION IF EXISTS create_observation(uuid, uuid, jsonb, timestamptz, text, text, text, integer);

-- The current version (9 params with image_hash) was already fixed in part 1.
-- Re-apply it here to be safe:
CREATE OR REPLACE FUNCTION create_observation(
    p_property_id  UUID,
    p_operation_id UUID        DEFAULT NULL,
    p_geom         JSONB       DEFAULT NULL,
    p_observed_at  TIMESTAMPTZ DEFAULT NOW(),
    p_type         TEXT        DEFAULT NULL,
    p_notes        TEXT        DEFAULT NULL,
    p_image_url    TEXT        DEFAULT NULL,
    p_bearing      INTEGER     DEFAULT NULL,
    p_image_hash   TEXT        DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO observations (
        property_id, operation_id, geom,
        observed_at, type, notes, image_url, bearing, image_hash, created_by
    ) VALUES (
        p_property_id,
        p_operation_id,
        CASE WHEN p_geom IS NOT NULL
            THEN ST_SetSRID(ST_GeomFromGeoJSON(p_geom::text), 4326)
            ELSE NULL
        END,
        p_observed_at,
        p_type,
        p_notes,
        p_image_url,
        p_bearing,
        p_image_hash,
        auth.uid()
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;


-- Old create_area: same signature but without created_by in body
-- No type difference so CREATE OR REPLACE in part 1 should have replaced it,
-- but re-apply to be safe:
CREATE OR REPLACE FUNCTION create_area(
    p_property_id uuid,
    p_name        text,
    p_parent_id   uuid DEFAULT NULL,
    p_level       text DEFAULT 'camp',
    p_type        text DEFAULT NULL,
    p_notes       text DEFAULT NULL,
    p_boundary    json DEFAULT NULL
)
RETURNS json AS $$
DECLARE
    r areas;
BEGIN
    INSERT INTO areas (property_id, parent_id, level, name, type, notes, boundary, created_by)
    VALUES (
        p_property_id,
        p_parent_id,
        COALESCE(p_level, 'camp'),
        p_name,
        p_type,
        p_notes,
        CASE WHEN p_boundary IS NOT NULL
            THEN ST_SetSRID(ST_GeomFromGeoJSON(p_boundary::text), 4326)
            ELSE NULL
        END,
        auth.uid()
    )
    RETURNING * INTO r;

    RETURN json_build_object(
        'id',          r.id,
        'property_id', r.property_id,
        'parent_id',   r.parent_id,
        'level',       r.level,
        'name',        r.name,
        'type',        r.type,
        'notes',       r.notes,
        'area_ha',     r.area_ha,
        'created_by',  r.created_by,
        'created_at',  r.created_at,
        'boundary',    CASE WHEN r.boundary IS NOT NULL
                           THEN ST_AsGeoJSON(r.boundary)::json
                           ELSE NULL
                       END
    );
END;
$$ LANGUAGE plpgsql VOLATILE SET search_path = public;


-- ─────────────────────────────────────────────────────────────────────────
-- 2. FIX backfill_device_readings — add SET search_path
-- ─────────────────────────────────────────────────────────────────────────

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

    v_rssi := (v_msg->'rx_metadata'->0->>'rssi')::SMALLINT;
    v_snr  := (v_msg->'rx_metadata'->0->>'snr')::REAL;
    v_gateway_id := LOWER(v_msg->'rx_metadata'->0->'gateway_ids'->>'gateway_id');

    IF v_dp IS NOT NULL THEN

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

      ELSIF v_dp ? 'distance_mm' THEN
        v_extra := jsonb_build_object('water_level_mm', (v_dp->>'distance_mm')::NUMERIC);
        IF v_dp->>'Bat' IS NOT NULL THEN
          v_bat := LEAST(ROUND((v_dp->>'Bat')::NUMERIC / 3.7 * 100), 100)::SMALLINT;
        END IF;
        v_matched := TRUE;

      ELSIF v_dp ? 'DOOR_OPEN_STATUS' THEN
        v_extra := jsonb_build_object(
          'door_open', (v_dp->>'DOOR_OPEN_STATUS')::INTEGER = 1,
          'open_duration_s', COALESCE((v_dp->>'LAST_DOOR_OPEN_DURATION')::NUMERIC, 0)
        );
        IF v_dp->>'Bat' IS NOT NULL THEN
          v_bat := LEAST(ROUND((v_dp->>'Bat')::NUMERIC / 3.7 * 100), 100)::SMALLINT;
        END IF;
        v_matched := TRUE;

      ELSIF v_dp ? 'latitude' AND v_dp ? 'longitude' THEN
        v_lat := (v_dp->>'latitude')::DOUBLE PRECISION;
        v_lng := (v_dp->>'longitude')::DOUBLE PRECISION;
        IF v_dp->>'battery' IS NOT NULL THEN
          v_bat := (v_dp->>'battery')::SMALLINT;
        END IF;
        v_matched := TRUE;

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

    IF v_lat IS NULL AND v_msg->'locations'->'frm-payload' IS NOT NULL THEN
      v_lat := (v_msg->'locations'->'frm-payload'->>'latitude')::DOUBLE PRECISION;
      v_lng := (v_msg->'locations'->'frm-payload'->>'longitude')::DOUBLE PRECISION;
    END IF;

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
$$ LANGUAGE plpgsql SET search_path = public;


-- ─────────────────────────────────────────────────────────────────────────
-- 3. FIX RLS "Always True" on observation_tag_types and observation_tags
--    The service_role policies are fine, but Supabase flags the
--    property_id IS NULL condition as overly permissive.
--    Replace with explicit auth check: global tags visible to any
--    authenticated user, property-scoped tags gated by access check.
-- ─────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
    -- observation_tag_types: tighten SELECT policy
    EXECUTE 'DROP POLICY IF EXISTS tag_types_select ON observation_tag_types';
    EXECUTE 'CREATE POLICY tag_types_select ON observation_tag_types FOR SELECT
        USING (
            (property_id IS NULL AND auth.uid() IS NOT NULL)
            OR user_has_property_access(property_id)
        )';

    -- observation_tag_types: tighten INSERT policy
    EXECUTE 'DROP POLICY IF EXISTS tag_types_insert ON observation_tag_types';
    EXECUTE 'CREATE POLICY tag_types_insert ON observation_tag_types FOR INSERT
        WITH CHECK (
            user_has_property_access(property_id)
        )';

    -- observation_tags: tighten SELECT policy
    EXECUTE 'DROP POLICY IF EXISTS obs_tags_select ON observation_tags';
    EXECUTE 'CREATE POLICY obs_tags_select ON observation_tags FOR SELECT
        USING (
            auth.uid() IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM observations o
                WHERE o.id = observation_tags.observation_id
                AND user_has_property_access(o.property_id)
            )
        )';

    -- observation_tags: tighten INSERT policy
    EXECUTE 'DROP POLICY IF EXISTS obs_tags_insert ON observation_tags';
    EXECUTE 'CREATE POLICY obs_tags_insert ON observation_tags FOR INSERT
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM observations o
                WHERE o.id = observation_tags.observation_id
                AND user_has_property_access(o.property_id)
            )
        )';

    -- observation_tags: tighten DELETE policy
    EXECUTE 'DROP POLICY IF EXISTS obs_tags_delete ON observation_tags';
    EXECUTE 'CREATE POLICY obs_tags_delete ON observation_tags FOR DELETE
        USING (
            EXISTS (
                SELECT 1 FROM observations o
                WHERE o.id = observation_tags.observation_id
                AND user_has_property_access(o.property_id)
            )
        )';

EXCEPTION WHEN undefined_table THEN NULL;
END $$;


-- ══════════════════════════════════════════════════════════════════════════
-- DONE. Expected Security Advisor results after running:
--   Errors:   0
--   Warnings: 2 (postgis Extension in Public + Leaked Password Protection)
--   Both are non-actionable on the free plan.
-- ══════════════════════════════════════════════════════════════════════════
