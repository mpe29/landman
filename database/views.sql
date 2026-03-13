-- LANDMAN Database Views
-- These views expose geometry as GeoJSON for the Supabase REST API,
-- which returns PostGIS geometry as WKB hex by default.
-- area_ha is a generated column on the underlying tables — included here
-- so the frontend can display sizes without extra queries.

-- Note: views with geometry columns must be DROP+CREATE (not CREATE OR REPLACE)
-- when column lists change, because PostgreSQL tracks column positions.

DROP VIEW IF EXISTS properties_geo;
CREATE VIEW properties_geo AS
SELECT
    id,
    name,
    owner,
    area_ha,
    created_at,
    CASE WHEN boundary IS NOT NULL
        THEN ST_AsGeoJSON(boundary)::json
        ELSE NULL
    END AS boundary
FROM properties;

DROP VIEW IF EXISTS areas_geo;
CREATE VIEW areas_geo AS
SELECT
    id,
    property_id,
    parent_id,
    level,
    name,
    type,
    notes,
    area_ha,
    created_at,
    CASE WHEN boundary IS NOT NULL
        THEN ST_AsGeoJSON(boundary)::json
        ELSE NULL
    END AS boundary
FROM areas;

DROP VIEW IF EXISTS linear_assets_geo;
CREATE VIEW linear_assets_geo AS
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

DROP VIEW IF EXISTS point_assets_geo;
CREATE VIEW point_assets_geo AS
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
