-- Boundary edit RPCs — allows updating polygon geometry for areas and properties
-- Run in Supabase Dashboard → SQL Editor

CREATE OR REPLACE FUNCTION update_area_boundary(p_id uuid, p_boundary jsonb)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE areas
  SET boundary = ST_SetSRID(ST_GeomFromGeoJSON(p_boundary::text), 4326)
  WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION update_property_boundary(p_id uuid, p_boundary jsonb)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE properties
  SET boundary = ST_SetSRID(ST_GeomFromGeoJSON(p_boundary::text), 4326)
  WHERE id = p_id;
END;
$$;
