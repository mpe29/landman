-- LANDMAN Database Functions
-- RPC endpoints called via Supabase .rpc() for spatial inserts.
-- PostgREST cannot invoke ST_GeomFromGeoJSON() inline on INSERT,
-- so spatial writes go through these functions instead.
-- All functions return json with geometry already converted to GeoJSON.

-- ---------------------------------------------------------------
-- Properties
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_property(
    p_name        text,
    p_owner       text DEFAULT NULL,
    p_boundary    json DEFAULT NULL
)
RETURNS json AS $$
DECLARE
    r properties;
BEGIN
    INSERT INTO properties (name, owner, boundary)
    VALUES (
        p_name,
        p_owner,
        CASE WHEN p_boundary IS NOT NULL
            THEN ST_SetSRID(ST_GeomFromGeoJSON(p_boundary::text), 4326)
            ELSE NULL
        END
    )
    RETURNING * INTO r;

    RETURN json_build_object(
        'id',         r.id,
        'name',       r.name,
        'owner',      r.owner,
        'created_at', r.created_at,
        'boundary',   CASE WHEN r.boundary IS NOT NULL
                          THEN ST_AsGeoJSON(r.boundary)::json
                          ELSE NULL
                      END
    );
END;
$$ LANGUAGE plpgsql VOLATILE;

-- ---------------------------------------------------------------
-- Areas (paddocks, camps, habitat zones, etc.)
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_area(
    p_property_id uuid,
    p_name        text,
    p_type        text DEFAULT NULL,
    p_notes       text DEFAULT NULL,
    p_boundary    json DEFAULT NULL
)
RETURNS json AS $$
DECLARE
    r areas;
BEGIN
    INSERT INTO areas (property_id, name, type, notes, boundary)
    VALUES (
        p_property_id,
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
        'name',        r.name,
        'type',        r.type,
        'notes',       r.notes,
        'created_at',  r.created_at,
        'boundary',    CASE WHEN r.boundary IS NOT NULL
                           THEN ST_AsGeoJSON(r.boundary)::json
                           ELSE NULL
                       END
    );
END;
$$ LANGUAGE plpgsql VOLATILE;

-- ---------------------------------------------------------------
-- Linear assets (fences, roads, pipelines, etc.)
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_linear_asset(
    p_property_id uuid,
    p_name        text,
    p_type        text DEFAULT NULL,
    p_condition   text DEFAULT NULL,
    p_notes       text DEFAULT NULL,
    p_geom        json DEFAULT NULL
)
RETURNS json AS $$
DECLARE
    r linear_assets;
BEGIN
    INSERT INTO linear_assets (property_id, name, type, condition, notes, geom)
    VALUES (
        p_property_id,
        p_name,
        p_type,
        p_condition,
        p_notes,
        CASE WHEN p_geom IS NOT NULL
            THEN ST_SetSRID(ST_GeomFromGeoJSON(p_geom::text), 4326)
            ELSE NULL
        END
    )
    RETURNING * INTO r;

    RETURN json_build_object(
        'id',          r.id,
        'property_id', r.property_id,
        'name',        r.name,
        'type',        r.type,
        'condition',   r.condition,
        'notes',       r.notes,
        'created_at',  r.created_at,
        'geom',        CASE WHEN r.geom IS NOT NULL
                           THEN ST_AsGeoJSON(r.geom)::json
                           ELSE NULL
                       END
    );
END;
$$ LANGUAGE plpgsql VOLATILE;

-- ---------------------------------------------------------------
-- Point assets (boreholes, kraals, gates, tanks, sensors, etc.)
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_point_asset(
    p_property_id uuid,
    p_name        text,
    p_type        text DEFAULT NULL,
    p_condition   text DEFAULT NULL,
    p_notes       text DEFAULT NULL,
    p_geom        json DEFAULT NULL
)
RETURNS json AS $$
DECLARE
    r point_assets;
BEGIN
    INSERT INTO point_assets (property_id, name, type, condition, notes, geom)
    VALUES (
        p_property_id,
        p_name,
        p_type,
        p_condition,
        p_notes,
        CASE WHEN p_geom IS NOT NULL
            THEN ST_SetSRID(ST_GeomFromGeoJSON(p_geom::text), 4326)
            ELSE NULL
        END
    )
    RETURNING * INTO r;

    RETURN json_build_object(
        'id',          r.id,
        'property_id', r.property_id,
        'name',        r.name,
        'type',        r.type,
        'condition',   r.condition,
        'notes',       r.notes,
        'created_at',  r.created_at,
        'geom',        CASE WHEN r.geom IS NOT NULL
                           THEN ST_AsGeoJSON(r.geom)::json
                           ELSE NULL
                       END
    );
END;
$$ LANGUAGE plpgsql VOLATILE;
