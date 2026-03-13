-- LANDMAN Database Schema
-- PostgreSQL + PostGIS
-- SRID 4326 (WGS84) used throughout for GPS-native coordinates

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS postgis;

-- ---------------------------------------------------------------------------
-- Properties
-- Top-level land unit: farm, ranch, or park. Everything else belongs to one.
-- ---------------------------------------------------------------------------

CREATE TABLE properties (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    owner       TEXT,
    boundary    GEOMETRY(POLYGON, 4326),
    area_ha     NUMERIC GENERATED ALWAYS AS (
                    ROUND((ST_Area(boundary::geography) / 10000)::numeric, 2)
                ) STORED,
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_properties_boundary ON properties USING GIST(boundary);

-- ---------------------------------------------------------------------------
-- Areas
-- Polygon subdivisions of a property: paddocks, grazing blocks, habitat zones.
-- ---------------------------------------------------------------------------

CREATE TABLE areas (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    parent_id   UUID REFERENCES areas(id) ON DELETE SET NULL,
    level       TEXT DEFAULT 'camp',  -- farm | camp | paddock
    name        TEXT NOT NULL,
    type        TEXT,                 -- grazing_block | game_camp | habitat_zone | other (optional subcategory)
    boundary    GEOMETRY(POLYGON, 4326),
    area_ha     NUMERIC GENERATED ALWAYS AS (
                    ROUND((ST_Area(boundary::geography) / 10000)::numeric, 2)
                ) STORED,
    notes       TEXT,
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_areas_property ON areas(property_id);
CREATE INDEX idx_areas_boundary ON areas USING GIST(boundary);

-- ---------------------------------------------------------------------------
-- Linear Assets
-- Line geometry infrastructure: fences, roads, pipelines, watercourses.
-- ---------------------------------------------------------------------------

CREATE TABLE linear_assets (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    name        TEXT,
    type        TEXT NOT NULL,  -- fence | road | pipeline | watercourse | other
    geom        GEOMETRY(LINESTRING, 4326),
    condition   TEXT,           -- good | fair | poor | damaged
    notes       TEXT,
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_linear_assets_property ON linear_assets(property_id);
CREATE INDEX idx_linear_assets_geom ON linear_assets USING GIST(geom);

-- ---------------------------------------------------------------------------
-- Point Assets
-- Point geometry infrastructure: boreholes, tanks, kraals, gates, sensors.
-- ---------------------------------------------------------------------------

CREATE TABLE point_assets (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    name        TEXT,
    type        TEXT NOT NULL,  -- borehole | tank | kraal | gate | sensor | other
    geom        GEOMETRY(POINT, 4326),
    condition   TEXT,           -- good | fair | poor | damaged
    notes       TEXT,
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_point_assets_property ON point_assets(property_id);
CREATE INDEX idx_point_assets_geom ON point_assets USING GIST(geom);

-- ---------------------------------------------------------------------------
-- Operations
-- Higher-level structured activities: vaccination campaigns, fence builds,
-- ranger patrols, land inspections. May span multiple days.
-- ---------------------------------------------------------------------------

CREATE TABLE operations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    type        TEXT NOT NULL,  -- vaccination | fencing | inspection | patrol | other
    started_at  TIMESTAMP,
    ended_at    TIMESTAMP,
    notes       TEXT,
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_operations_property ON operations(property_id);
CREATE INDEX idx_operations_started ON operations(started_at);

-- ---------------------------------------------------------------------------
-- Observations
-- A field observation tied to a specific location and time.
-- This is the core unit of ground-truth data in the system.
-- ---------------------------------------------------------------------------

CREATE TABLE observations (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id  UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    operation_id UUID REFERENCES operations(id) ON DELETE SET NULL,
    geom         GEOMETRY(POINT, 4326),
    observed_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    type         TEXT,     -- grass_condition | erosion | fence_damage | livestock_presence | other
    notes        TEXT,
    tags         TEXT[],   -- flexible tagging: ["dry", "overgrazed", "urgent"]
    created_at   TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_observations_property ON observations(property_id);
CREATE INDEX idx_observations_operation ON observations(operation_id);
CREATE INDEX idx_observations_observed ON observations(observed_at);
CREATE INDEX idx_observations_geom ON observations USING GIST(geom);

-- ---------------------------------------------------------------------------
-- Media
-- Images, video, or other field media. Geolocation is extracted from EXIF.
-- Linked to an observation, but can exist without one.
-- ---------------------------------------------------------------------------

CREATE TABLE media (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    observation_id UUID REFERENCES observations(id) ON DELETE SET NULL,
    file_path      TEXT NOT NULL,
    type           TEXT,      -- image | video
    geom           GEOMETRY(POINT, 4326),  -- from EXIF metadata
    captured_at    TIMESTAMP,
    created_at     TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_media_observation ON media(observation_id);
CREATE INDEX idx_media_geom ON media USING GIST(geom);
