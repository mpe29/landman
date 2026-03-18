-- ──────────────────────────────────────────────────────────────────────────
-- LANDMAN: Backfill SenseCAP readings that were mis-parsed by trail camera matcher
-- Run in Supabase SQL Editor AFTER deploying the fixed ingest function
--
-- The trail camera parser matched SenseCAP payloads because decoded_payload
-- contained motion: {count: null, detected: null} (an object, not a boolean).
-- This caused all GPS, battery, and temperature data to be lost.
--
-- This script re-extracts coordinates and battery from the stored raw JSONB.
-- ──────────────────────────────────────────────────────────────────────────

-- Fix readings where decoded_payload has SenseCAP fields but lat/lng were not extracted
UPDATE sensor_readings sr
SET
    lat = COALESCE(
        -- Try decoded_payload.lat first (older codec)
        (sr.raw->'uplink_message'->'decoded_payload'->>'lat')::double precision,
        -- Then locations.frm-payload (newer codec)
        (sr.raw->'uplink_message'->'locations'->'frm-payload'->>'latitude')::double precision
    ),
    lng = COALESCE(
        (sr.raw->'uplink_message'->'decoded_payload'->>'lon')::double precision,
        (sr.raw->'uplink_message'->'locations'->'frm-payload'->>'longitude')::double precision
    ),
    battery_pct = (sr.raw->'uplink_message'->'decoded_payload'->>'battery_pct')::smallint,
    extra = jsonb_build_object(
        'fix_tech', sr.raw->'uplink_message'->'decoded_payload'->>'fix_tech',
        'temperature_c', (sr.raw->'uplink_message'->'decoded_payload'->>'ic_temp_c')::real,
        'has_fix', (sr.raw->'uplink_message'->'decoded_payload'->>'has_fix')::boolean,
        'backfilled', true
    )
WHERE sr.lat IS NULL
  AND sr.raw->'uplink_message'->'decoded_payload'->>'device_type' = 'sensecap_t1000'
  AND (
    sr.raw->'uplink_message'->'decoded_payload'->>'has_fix' = 'true'
    OR sr.raw->'uplink_message'->'locations'->'frm-payload'->>'latitude' IS NOT NULL
  );

-- Also fix readings where has_fix was present (older codec) but motion stole the match
UPDATE sensor_readings sr
SET
    lat = COALESCE(
        (sr.raw->'uplink_message'->'decoded_payload'->>'lat')::double precision,
        (sr.raw->'uplink_message'->'locations'->'frm-payload'->>'latitude')::double precision
    ),
    lng = COALESCE(
        (sr.raw->'uplink_message'->'decoded_payload'->>'lon')::double precision,
        (sr.raw->'uplink_message'->'locations'->'frm-payload'->>'longitude')::double precision
    ),
    battery_pct = (sr.raw->'uplink_message'->'decoded_payload'->>'battery_pct')::smallint,
    extra = jsonb_build_object(
        'has_fix', (sr.raw->'uplink_message'->'decoded_payload'->>'has_fix')::boolean,
        'temperature_c', (sr.raw->'uplink_message'->'decoded_payload'->>'ic_temp_c')::real,
        'backfilled', true
    )
WHERE sr.lat IS NULL
  AND sr.raw->'uplink_message'->'decoded_payload'->>'has_fix' = 'true'
  AND sr.raw->'uplink_message'->'decoded_payload'->>'device_type' IS NULL;

-- Update device last_* from the most recent reading with coordinates
UPDATE devices d
SET
    last_lat = sub.lat,
    last_lng = sub.lng,
    last_battery_pct = sub.battery_pct,
    last_seen_at = sub.received_at
FROM (
    SELECT DISTINCT ON (device_id)
        device_id, lat, lng, battery_pct, received_at
    FROM sensor_readings
    WHERE lat IS NOT NULL AND lng IS NOT NULL
    ORDER BY device_id, received_at DESC
) sub
WHERE d.id = sub.device_id;
