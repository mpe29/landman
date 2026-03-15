-- ── Add bearing column to observations ────────────────────────────
-- Run this in the Supabase SQL Editor.
-- bearing stores the EXIF GPSImgDirection (0–360°, integer degrees).

ALTER TABLE observations
  ADD COLUMN IF NOT EXISTS bearing INTEGER;

-- ── Update create_observation RPC to accept bearing ───────────────
CREATE OR REPLACE FUNCTION create_observation(
  p_property_id  UUID,
  p_operation_id UUID    DEFAULT NULL,
  p_geom         JSONB   DEFAULT NULL,
  p_observed_at  TIMESTAMPTZ DEFAULT NOW(),
  p_type         TEXT    DEFAULT NULL,
  p_notes        TEXT    DEFAULT NULL,
  p_image_url    TEXT    DEFAULT NULL,
  p_bearing      INTEGER DEFAULT NULL
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
    observed_at, type, notes, image_url, bearing
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
    p_bearing
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ── Refresh observations_geo view to include bearing ──────────────
-- Drop and recreate so bearing is available when clicking observations on map.
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
  o.created_at,
  ST_AsGeoJSON(o.geom)::json AS geom
FROM observations o;
