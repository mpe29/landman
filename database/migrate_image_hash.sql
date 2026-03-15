-- ── Add image_hash to observations for duplicate detection ──────────────────
-- Run this in the Supabase SQL Editor.
-- SHA-256 hex digest of the raw file bytes, computed client-side before upload.

ALTER TABLE observations
  ADD COLUMN IF NOT EXISTS image_hash TEXT;

-- Unique per property so the same photo can't be uploaded twice to the same farm,
-- but the same image CAN exist on different properties.
CREATE UNIQUE INDEX IF NOT EXISTS observations_property_image_hash_unique
  ON observations (property_id, image_hash)
  WHERE image_hash IS NOT NULL;

-- ── Update create_observation RPC to accept p_image_hash ─────────────────────
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
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO observations (
    property_id, operation_id, geom,
    observed_at, type, notes, image_url, bearing, image_hash
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
    p_image_hash
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ── Refresh observations_geo view to include image_hash ──────────────────────
DROP VIEW IF EXISTS observations_geo;

CREATE VIEW observations_geo AS
SELECT
  o.id,
  o.property_id,
  o.operation_id,
  o.observed_at,
  o.type,
  o.notes,
  o.image_url,
  o.bearing,
  o.image_hash,
  o.created_at,
  ST_AsGeoJSON(o.geom)::json AS geom
FROM observations o;
