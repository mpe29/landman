-- LANDMAN Database Functions
-- RPC endpoints called via Supabase .rpc() for spatial inserts.
-- PostgREST cannot invoke ST_GeomFromGeoJSON() inline on INSERT,
-- so spatial writes go through these functions instead.
-- All functions include created_by = auth.uid() for audit trail.

-- ---------------------------------------------------------------
-- Properties
-- Sets owner_id to the authenticated user and auto-creates a
-- property_members row with role=owner, is_admin=TRUE.
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

    -- Auto-create membership for the owner
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

-- ---------------------------------------------------------------
-- Areas (farms, camps, paddocks, habitat zones, etc.)
-- ---------------------------------------------------------------
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
$$ LANGUAGE plpgsql VOLATILE;

-- ---------------------------------------------------------------
-- Observations
-- Latest version with bearing + image_hash + created_by
-- ---------------------------------------------------------------
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
    -- Verify caller has access to this property (SECURITY DEFINER bypasses RLS)
    IF NOT user_has_property_access(p_property_id) THEN
        RAISE EXCEPTION 'Access denied: you do not have access to this property';
    END IF;

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

-- ---------------------------------------------------------------
-- Livestock
-- ---------------------------------------------------------------
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
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------
-- Livestock Events
-- ---------------------------------------------------------------
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
$$ LANGUAGE plpgsql;
