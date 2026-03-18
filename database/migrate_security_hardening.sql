-- ══════════════════════════════════════════════════════════════════════════
-- LANDMAN: Security Hardening
-- Fixes Supabase Security Advisor errors + warnings:
--   1. Function Search Path Mutable — adds SET search_path to all functions
--   2. Security Definer Views       — adds security_invoker = true to all views
--
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Safe to run multiple times (all statements are idempotent).
-- ══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────
-- 1. FIX FUNCTIONS: Add SET search_path = public
--    This prevents search_path injection attacks, especially critical
--    for SECURITY DEFINER functions which run with elevated privileges.
-- ─────────────────────────────────────────────────────────────────────────

-- ── create_property (SECURITY DEFINER) ──
CREATE OR REPLACE FUNCTION create_property(
    p_name        text,
    p_owner       text DEFAULT NULL,
    p_boundary    json DEFAULT NULL
)
RETURNS json AS $$
DECLARE
    r properties;
BEGIN
    INSERT INTO properties (name, owner, owner_id, boundary)
    VALUES (
        p_name,
        p_owner,
        auth.uid(),
        CASE WHEN p_boundary IS NOT NULL
            THEN ST_SetSRID(ST_GeomFromGeoJSON(p_boundary::text), 4326)
            ELSE NULL
        END
    )
    RETURNING * INTO r;

    INSERT INTO property_members (property_id, user_id, role, is_admin, status)
    VALUES (r.id, auth.uid(), 'owner', TRUE, 'approved');

    RETURN json_build_object(
        'id',         r.id,
        'name',       r.name,
        'owner',      r.owner,
        'owner_id',   r.owner_id,
        'created_at', r.created_at,
        'boundary',   CASE WHEN r.boundary IS NOT NULL
                          THEN ST_AsGeoJSON(r.boundary)::json
                          ELSE NULL
                      END
    );
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public;


-- ── create_observation (SECURITY DEFINER) ──
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


-- ── user_has_property_access (SECURITY DEFINER) ──
CREATE OR REPLACE FUNCTION user_has_property_access(prop_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM property_members
        WHERE property_id = prop_id
        AND user_id = auth.uid()
        AND status = 'approved'
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;


-- ── user_is_property_admin (SECURITY DEFINER) ──
CREATE OR REPLACE FUNCTION user_is_property_admin(prop_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM property_members
        WHERE property_id = prop_id
        AND user_id = auth.uid()
        AND status = 'approved'
        AND is_admin = TRUE
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;


-- ── handle_new_user (SECURITY DEFINER) ──
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO profiles (id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', '')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ── create_area ──
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


-- ── create_linear_asset ──
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
    INSERT INTO linear_assets (property_id, name, type, condition, notes, geom, created_by)
    VALUES (
        p_property_id,
        p_name,
        p_type,
        p_condition,
        p_notes,
        CASE WHEN p_geom IS NOT NULL
            THEN ST_SetSRID(ST_GeomFromGeoJSON(p_geom::text), 4326)
            ELSE NULL
        END,
        auth.uid()
    )
    RETURNING * INTO r;

    RETURN json_build_object(
        'id',          r.id,
        'property_id', r.property_id,
        'name',        r.name,
        'type',        r.type,
        'condition',   r.condition,
        'notes',       r.notes,
        'created_by',  r.created_by,
        'created_at',  r.created_at,
        'geom',        CASE WHEN r.geom IS NOT NULL
                           THEN ST_AsGeoJSON(r.geom)::json
                           ELSE NULL
                       END
    );
END;
$$ LANGUAGE plpgsql VOLATILE SET search_path = public;


-- ── create_point_asset ──
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
    INSERT INTO point_assets (property_id, name, type, condition, notes, geom, created_by)
    VALUES (
        p_property_id,
        p_name,
        p_type,
        p_condition,
        p_notes,
        CASE WHEN p_geom IS NOT NULL
            THEN ST_SetSRID(ST_GeomFromGeoJSON(p_geom::text), 4326)
            ELSE NULL
        END,
        auth.uid()
    )
    RETURNING * INTO r;

    RETURN json_build_object(
        'id',          r.id,
        'property_id', r.property_id,
        'name',        r.name,
        'type',        r.type,
        'condition',   r.condition,
        'notes',       r.notes,
        'created_by',  r.created_by,
        'created_at',  r.created_at,
        'geom',        CASE WHEN r.geom IS NOT NULL
                           THEN ST_AsGeoJSON(r.geom)::json
                           ELSE NULL
                       END
    );
END;
$$ LANGUAGE plpgsql VOLATILE SET search_path = public;


-- ── create_livestock ──
CREATE OR REPLACE FUNCTION create_livestock(
    p_property_id       UUID,
    p_camp_id           UUID    DEFAULT NULL,
    p_livestock_type_id UUID    DEFAULT NULL,
    p_breed_id          UUID    DEFAULT NULL,
    p_is_group          BOOLEAN DEFAULT TRUE,
    p_head_count        INTEGER DEFAULT 1,
    p_sex               TEXT    DEFAULT NULL,
    p_dob               DATE    DEFAULT NULL,
    p_tag_number        TEXT    DEFAULT NULL,
    p_acquired_at       DATE    DEFAULT NULL,
    p_notes             TEXT    DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO livestock (
        property_id, camp_id, livestock_type_id, breed_id,
        is_group, head_count, sex, dob, tag_number, acquired_at, notes, created_by
    ) VALUES (
        p_property_id, p_camp_id, p_livestock_type_id, p_breed_id,
        p_is_group, p_head_count, p_sex, p_dob, p_tag_number, p_acquired_at, p_notes,
        auth.uid()
    )
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql SET search_path = public;


-- ── create_livestock_event ──
CREATE OR REPLACE FUNCTION create_livestock_event(
    p_livestock_id UUID,
    p_event_type   TEXT,
    p_event_date   DATE    DEFAULT CURRENT_DATE,
    p_head_count   INTEGER DEFAULT 1,
    p_camp_from    UUID    DEFAULT NULL,
    p_camp_to      UUID    DEFAULT NULL,
    p_notes        TEXT    DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO livestock_events (
        livestock_id, event_type, event_date, head_count, camp_from, camp_to, notes, created_by
    ) VALUES (
        p_livestock_id, p_event_type, p_event_date, p_head_count, p_camp_from, p_camp_to, p_notes,
        auth.uid()
    )
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql SET search_path = public;


-- ── sensor_readings_set_geom (trigger) ──
CREATE OR REPLACE FUNCTION sensor_readings_set_geom()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
        NEW.geom = ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;


-- ── devices_update_last_seen (trigger) ──
CREATE OR REPLACE FUNCTION devices_update_last_seen()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE devices
    SET
        last_seen_at     = NEW.received_at,
        last_lat         = COALESCE(NEW.lat, last_lat),
        last_lng         = COALESCE(NEW.lng, last_lng),
        last_battery_pct = COALESCE(NEW.battery_pct, last_battery_pct)
    WHERE id = NEW.device_id
      AND (last_seen_at IS NULL OR NEW.received_at > last_seen_at);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;


-- ── update_area_boundary ──
CREATE OR REPLACE FUNCTION update_area_boundary(p_id uuid, p_boundary jsonb)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE areas
  SET boundary = ST_SetSRID(ST_GeomFromGeoJSON(p_boundary::text), 4326)
  WHERE id = p_id;
END;
$$;


-- ── update_property_boundary ──
CREATE OR REPLACE FUNCTION update_property_boundary(p_id uuid, p_boundary jsonb)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE properties
  SET boundary = ST_SetSRID(ST_GeomFromGeoJSON(p_boundary::text), 4326)
  WHERE id = p_id;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────
-- 2. FIX VIEWS: Add security_invoker = true
--    Without this, views run as the view OWNER (postgres), bypassing RLS.
--    With security_invoker, queries run as the calling user and RLS applies.
-- ─────────────────────────────────────────────────────────────────────────

-- ── properties_geo ──
DROP VIEW IF EXISTS properties_geo CASCADE;
CREATE VIEW properties_geo WITH (security_invoker = true) AS
SELECT
    id,
    name,
    owner,
    owner_id,
    area_ha,
    created_at,
    CASE WHEN boundary IS NOT NULL
        THEN ST_AsGeoJSON(boundary)::json
        ELSE NULL
    END AS boundary
FROM properties;

-- ── observations_geo ──
DROP VIEW IF EXISTS observations_geo CASCADE;
CREATE VIEW observations_geo WITH (security_invoker = true) AS
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
    o.created_by,
    o.created_at,
    ST_AsGeoJSON(o.geom)::json AS geom
FROM observations o;

-- ── livestock_alive_counts (dependency of areas_geo and livestock_camp_counts) ──
DROP VIEW IF EXISTS livestock_alive_counts CASCADE;
CREATE VIEW livestock_alive_counts WITH (security_invoker = true) AS
SELECT
    l.*,
    lt.common_name,
    lt.emoji,
    lt.lsu_value,
    lt.category,
    b.name AS breed_name,
    l.head_count - COALESCE((
        SELECT SUM(le.head_count)
        FROM livestock_events le
        WHERE le.livestock_id = l.id
          AND le.event_type IN ('slaughter','death','lost','poached','sold','moved')
    ), 0) AS alive_count
FROM livestock l
JOIN livestock_types lt ON lt.id = l.livestock_type_id
LEFT JOIN breeds b ON b.id = l.breed_id;

-- ── livestock_camp_counts ──
CREATE VIEW livestock_camp_counts WITH (security_invoker = true) AS
SELECT
    a.id            AS camp_id,
    a.property_id,
    a.name          AS camp_name,
    ST_AsGeoJSON(ST_Centroid(a.boundary))::json AS geom,
    SUM(lac.alive_count)                         AS total_head,
    STRING_AGG(
        lac.emoji || ' ' || lac.alive_count::text,
        '  '
        ORDER BY lac.emoji
    ) AS label
FROM areas a
JOIN livestock_alive_counts lac ON lac.camp_id = a.id
WHERE a.level IN ('camp', 'paddock')
  AND lac.alive_count > 0
GROUP BY a.id, a.property_id, a.boundary, a.name;

-- ── areas_geo ──
CREATE VIEW areas_geo WITH (security_invoker = true) AS
SELECT
    a.id,
    a.property_id,
    a.parent_id,
    a.level,
    a.name,
    a.type,
    a.notes,
    a.area_ha,
    a.created_by,
    a.created_at,
    COALESCE((
        SELECT SUM(lac.alive_count)
        FROM livestock_alive_counts lac
        WHERE lac.camp_id = a.id
    ), 0) AS livestock_count,
    CASE WHEN a.boundary IS NOT NULL
        THEN ST_AsGeoJSON(a.boundary)::json
        ELSE NULL
    END AS boundary
FROM areas a;

-- ── linear_assets_geo ──
DROP VIEW IF EXISTS linear_assets_geo CASCADE;
CREATE VIEW linear_assets_geo WITH (security_invoker = true) AS
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

-- ── point_assets_geo ──
DROP VIEW IF EXISTS point_assets_geo CASCADE;
CREATE VIEW point_assets_geo WITH (security_invoker = true) AS
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

-- ── device_positions ──
CREATE OR REPLACE VIEW device_positions WITH (security_invoker = true) AS
SELECT
    d.id,
    d.name,
    d.dev_eui,
    d.active,
    d.last_seen_at,
    d.last_lat           AS lat,
    d.last_lng           AS lng,
    d.last_battery_pct   AS battery_pct,
    ST_SetSRID(ST_MakePoint(d.last_lng, d.last_lat), 4326) AS geom,
    d.area_id,
    a.name               AS area_name,
    d.property_id,
    p.name               AS property_name,
    d.device_type_id,
    dt.name              AS device_type_name,
    dt.category          AS device_type_category,
    dt.icon              AS device_type_icon
FROM devices d
LEFT JOIN device_types dt ON dt.id = d.device_type_id
LEFT JOIN areas        a  ON a.id  = d.area_id
LEFT JOIN properties   p  ON p.id  = d.property_id
WHERE d.last_lat IS NOT NULL
  AND d.last_lng IS NOT NULL;

-- ── routing_log ──
CREATE OR REPLACE VIEW routing_log WITH (security_invoker = true) AS
SELECT
    sr.id            AS reading_id,
    sr.device_id,
    d.name           AS device_name,
    d.dev_eui        AS device_eui,
    sr.gateway_id,
    sr.received_at,
    sr.lat,
    sr.lng,
    sr.rssi,
    sr.snr,
    sr.battery_pct
FROM sensor_readings sr
JOIN devices d ON d.id = sr.device_id
WHERE sr.gateway_id IS NOT NULL;


-- ══════════════════════════════════════════════════════════════════════════
-- DONE. Expected Security Advisor results after running:
--   Errors:   0  (all functions now have SET search_path)
--   Warnings: 1  (spatial_ref_sys — PostGIS extension table, safe to ignore)
-- ══════════════════════════════════════════════════════════════════════════
