-- Migration: Observations — image support
-- Run this once against the live Supabase database.
-- Safe to run multiple times (IF NOT EXISTS / OR REPLACE).

-- 1. Add image_url column to observations table
ALTER TABLE observations
    ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 2. Re-create observations_geo view to include image_url
--    (must DROP first because column list changed)
DROP VIEW IF EXISTS observations_geo;
CREATE VIEW observations_geo AS
SELECT
    id,
    property_id,
    operation_id,
    observed_at,
    type,
    notes,
    image_url,
    tags,
    created_at,
    CASE WHEN geom IS NOT NULL
        THEN ST_AsGeoJSON(geom)::json
        ELSE NULL
    END AS geom
FROM observations;

-- 3. Fix create_area function to honour parent_id and level
--    (previous version silently dropped these params)
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
    INSERT INTO areas (property_id, parent_id, level, name, type, notes, boundary)
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
        END
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
        'created_at',  r.created_at,
        'boundary',    CASE WHEN r.boundary IS NOT NULL
                           THEN ST_AsGeoJSON(r.boundary)::json
                           ELSE NULL
                       END
    );
END;
$$ LANGUAGE plpgsql VOLATILE;

-- 4. Add create_observation function
CREATE OR REPLACE FUNCTION create_observation(
    p_property_id  uuid,
    p_operation_id uuid        DEFAULT NULL,
    p_geom         json        DEFAULT NULL,
    p_observed_at  timestamptz DEFAULT NOW(),
    p_type         text        DEFAULT NULL,
    p_notes        text        DEFAULT NULL,
    p_image_url    text        DEFAULT NULL
)
RETURNS json AS $$
DECLARE
    r observations;
BEGIN
    INSERT INTO observations (property_id, operation_id, geom, observed_at, type, notes, image_url)
    VALUES (
        p_property_id,
        p_operation_id,
        CASE WHEN p_geom IS NOT NULL
            THEN ST_SetSRID(ST_GeomFromGeoJSON(p_geom::text), 4326)
            ELSE NULL
        END,
        COALESCE(p_observed_at, NOW()),
        p_type,
        p_notes,
        p_image_url
    )
    RETURNING * INTO r;

    RETURN json_build_object(
        'id',           r.id,
        'property_id',  r.property_id,
        'operation_id', r.operation_id,
        'observed_at',  r.observed_at,
        'type',         r.type,
        'notes',        r.notes,
        'image_url',    r.image_url,
        'created_at',   r.created_at,
        'geom',         CASE WHEN r.geom IS NOT NULL
                            THEN ST_AsGeoJSON(r.geom)::json
                            ELSE NULL
                        END
    );
END;
$$ LANGUAGE plpgsql VOLATILE;

-- 5. Storage bucket: run in Supabase dashboard → Storage → New bucket
--    Name: observation-images
--    Public: YES  (so image URLs work without auth tokens)
--    Allowed MIME types: image/jpeg, image/png, image/heic, image/webp
