-- LANDMAN Database Views
-- These views expose geometry as GeoJSON for the Supabase REST API,
-- which returns PostGIS geometry as WKB hex by default.

CREATE OR REPLACE VIEW properties_geo AS
SELECT
    id,
    name,
    owner,
    created_at,
    CASE WHEN boundary IS NOT NULL
        THEN ST_AsGeoJSON(boundary)::json
        ELSE NULL
    END AS boundary
FROM properties;

CREATE OR REPLACE VIEW areas_geo AS
SELECT
    id,
    property_id,
    name,
    type,
    notes,
    created_at,
    CASE WHEN boundary IS NOT NULL
        THEN ST_AsGeoJSON(boundary)::json
        ELSE NULL
    END AS boundary
FROM areas;

CREATE OR REPLACE VIEW linear_assets_geo AS
SELECT
    id,
    property_id,
    name,
    type,
    condition,
    notes,
    created_at,
    CASE WHEN geom IS NOT NULL
        THEN ST_AsGeoJSON(geom)::json
        ELSE NULL
    END AS geom
FROM linear_assets;

CREATE OR REPLACE VIEW point_assets_geo AS
SELECT
    id,
    property_id,
    name,
    type,
    condition,
    notes,
    created_at,
    CASE WHEN geom IS NOT NULL
        THEN ST_AsGeoJSON(geom)::json
        ELSE NULL
    END AS geom
FROM point_assets;

CREATE OR REPLACE VIEW observations_geo AS
SELECT
    id,
    property_id,
    operation_id,
    observed_at,
    type,
    notes,
    tags,
    created_at,
    CASE WHEN geom IS NOT NULL
        THEN ST_AsGeoJSON(geom)::json
        ELSE NULL
    END AS geom
FROM observations;
