-- ══════════════════════════════════════════════════════════════════════════
-- LANDMAN: Authentication, Profiles & Role-Based Access Control
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query)
--
-- Creates: profiles, property_members tables
-- Adds:    owner_id to properties, created_by to activity tables
-- Creates: RLS policies on all tables
-- Creates: helper functions for access checks
--
-- IMPORTANT: Run this BEFORE enabling RLS on any table.
-- After running, sign up the first owner, then backfill existing data.
-- ══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────
-- 1. ROLE ENUM
-- ─────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('owner', 'manager', 'staff', 'contractor');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ─────────────────────────────────────────────────────────────────────────
-- 2. PROFILES TABLE
-- Linked 1:1 with auth.users. Auto-created by trigger on signup.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS profiles (
    id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email      TEXT NOT NULL,
    full_name  TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile when a new auth user signs up
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ─────────────────────────────────────────────────────────────────────────
-- 3. PROPERTY MEMBERS TABLE
-- Junction between profiles and properties. Defines role + access.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS property_members (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role        user_role NOT NULL DEFAULT 'staff',
    is_admin    BOOLEAN NOT NULL DEFAULT FALSE,
    status      TEXT NOT NULL DEFAULT 'approved'
                CHECK (status IN ('pending', 'approved', 'rejected')),
    pin         TEXT,           -- plaintext PIN for admin-created accounts
    join_token  TEXT UNIQUE,    -- token for shareable join link
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (property_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_property_members_user     ON property_members(user_id);
CREATE INDEX IF NOT EXISTS idx_property_members_property ON property_members(property_id);
CREATE INDEX IF NOT EXISTS idx_property_members_token    ON property_members(join_token)
    WHERE join_token IS NOT NULL;


-- ─────────────────────────────────────────────────────────────────────────
-- 4. PROPERTY OWNERSHIP
-- ─────────────────────────────────────────────────────────────────────────

-- Add owner_id (nullable initially for migration of existing data)
DO $$ BEGIN
    ALTER TABLE properties ADD COLUMN owner_id UUID REFERENCES profiles(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_properties_owner ON properties(owner_id);


-- ─────────────────────────────────────────────────────────────────────────
-- 5. AUDIT TRAIL — created_by columns
-- ─────────────────────────────────────────────────────────────────────────

DO $$ BEGIN ALTER TABLE observations    ADD COLUMN created_by UUID REFERENCES profiles(id); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE areas           ADD COLUMN created_by UUID REFERENCES profiles(id); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE linear_assets   ADD COLUMN created_by UUID REFERENCES profiles(id); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE point_assets    ADD COLUMN created_by UUID REFERENCES profiles(id); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE operations      ADD COLUMN created_by UUID REFERENCES profiles(id); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE livestock       ADD COLUMN created_by UUID REFERENCES profiles(id); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE livestock_events ADD COLUMN created_by UUID REFERENCES profiles(id); EXCEPTION WHEN duplicate_column THEN NULL; END $$;


-- ─────────────────────────────────────────────────────────────────────────
-- 6. ACCESS HELPER FUNCTIONS
-- ─────────────────────────────────────────────────────────────────────────

-- Does the current authenticated user have approved access to this property?
CREATE OR REPLACE FUNCTION user_has_property_access(prop_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM property_members
        WHERE property_id = prop_id
        AND user_id = auth.uid()
        AND status = 'approved'
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Is the current authenticated user an admin of this property?
CREATE OR REPLACE FUNCTION user_is_property_admin(prop_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM property_members
        WHERE property_id = prop_id
        AND user_id = auth.uid()
        AND status = 'approved'
        AND is_admin = TRUE
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER;


-- ─────────────────────────────────────────────────────────────────────────
-- 7. ROW LEVEL SECURITY — PROFILES
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select ON profiles;
CREATE POLICY profiles_select ON profiles FOR SELECT
    USING (
        id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM property_members pm1
            JOIN property_members pm2 ON pm1.property_id = pm2.property_id
            WHERE pm1.user_id = auth.uid()
              AND pm2.user_id = profiles.id
              AND pm1.status = 'approved'
        )
    );

DROP POLICY IF EXISTS profiles_insert ON profiles;
CREATE POLICY profiles_insert ON profiles FOR INSERT
    WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS profiles_update ON profiles;
CREATE POLICY profiles_update ON profiles FOR UPDATE
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- Service role (edge functions) needs full access
DROP POLICY IF EXISTS profiles_service ON profiles;
CREATE POLICY profiles_service ON profiles FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');


-- ─────────────────────────────────────────────────────────────────────────
-- 8. ROW LEVEL SECURITY — PROPERTIES
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS properties_select ON properties;
CREATE POLICY properties_select ON properties FOR SELECT
    USING (user_has_property_access(id));

DROP POLICY IF EXISTS properties_insert ON properties;
CREATE POLICY properties_insert ON properties FOR INSERT
    WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS properties_update ON properties;
CREATE POLICY properties_update ON properties FOR UPDATE
    USING (user_has_property_access(id));

DROP POLICY IF EXISTS properties_delete ON properties;
CREATE POLICY properties_delete ON properties FOR DELETE
    USING (owner_id = auth.uid());

DROP POLICY IF EXISTS properties_service ON properties;
CREATE POLICY properties_service ON properties FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');


-- ─────────────────────────────────────────────────────────────────────────
-- 9. ROW LEVEL SECURITY — PROPERTY MEMBERS
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE property_members ENABLE ROW LEVEL SECURITY;

-- Members can see other members of the same property
DROP POLICY IF EXISTS members_select ON property_members;
CREATE POLICY members_select ON property_members FOR SELECT
    USING (user_has_property_access(property_id));

-- Only admins can add/modify/remove members
DROP POLICY IF EXISTS members_insert ON property_members;
CREATE POLICY members_insert ON property_members FOR INSERT
    WITH CHECK (user_is_property_admin(property_id));

DROP POLICY IF EXISTS members_update ON property_members;
CREATE POLICY members_update ON property_members FOR UPDATE
    USING (user_is_property_admin(property_id));

DROP POLICY IF EXISTS members_delete ON property_members;
CREATE POLICY members_delete ON property_members FOR DELETE
    USING (user_is_property_admin(property_id));

DROP POLICY IF EXISTS members_service ON property_members;
CREATE POLICY members_service ON property_members FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');


-- ─────────────────────────────────────────────────────────────────────────
-- 10. ROW LEVEL SECURITY — DIRECT PROPERTY CHILDREN
-- Same pattern for: areas, linear_assets, point_assets, operations,
-- observations, livestock, devices
-- ─────────────────────────────────────────────────────────────────────────

-- ── Areas ──
ALTER TABLE areas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS areas_select ON areas;
CREATE POLICY areas_select ON areas FOR SELECT USING (user_has_property_access(property_id));
DROP POLICY IF EXISTS areas_insert ON areas;
CREATE POLICY areas_insert ON areas FOR INSERT WITH CHECK (user_has_property_access(property_id));
DROP POLICY IF EXISTS areas_update ON areas;
CREATE POLICY areas_update ON areas FOR UPDATE USING (user_has_property_access(property_id));
DROP POLICY IF EXISTS areas_delete ON areas;
CREATE POLICY areas_delete ON areas FOR DELETE USING (user_has_property_access(property_id));
DROP POLICY IF EXISTS areas_service ON areas;
CREATE POLICY areas_service ON areas FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- ── Linear Assets ──
ALTER TABLE linear_assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS linear_assets_select ON linear_assets;
CREATE POLICY linear_assets_select ON linear_assets FOR SELECT USING (user_has_property_access(property_id));
DROP POLICY IF EXISTS linear_assets_insert ON linear_assets;
CREATE POLICY linear_assets_insert ON linear_assets FOR INSERT WITH CHECK (user_has_property_access(property_id));
DROP POLICY IF EXISTS linear_assets_update ON linear_assets;
CREATE POLICY linear_assets_update ON linear_assets FOR UPDATE USING (user_has_property_access(property_id));
DROP POLICY IF EXISTS linear_assets_delete ON linear_assets;
CREATE POLICY linear_assets_delete ON linear_assets FOR DELETE USING (user_has_property_access(property_id));
DROP POLICY IF EXISTS linear_assets_service ON linear_assets;
CREATE POLICY linear_assets_service ON linear_assets FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- ── Point Assets ──
ALTER TABLE point_assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS point_assets_select ON point_assets;
CREATE POLICY point_assets_select ON point_assets FOR SELECT USING (user_has_property_access(property_id));
DROP POLICY IF EXISTS point_assets_insert ON point_assets;
CREATE POLICY point_assets_insert ON point_assets FOR INSERT WITH CHECK (user_has_property_access(property_id));
DROP POLICY IF EXISTS point_assets_update ON point_assets;
CREATE POLICY point_assets_update ON point_assets FOR UPDATE USING (user_has_property_access(property_id));
DROP POLICY IF EXISTS point_assets_delete ON point_assets;
CREATE POLICY point_assets_delete ON point_assets FOR DELETE USING (user_has_property_access(property_id));
DROP POLICY IF EXISTS point_assets_service ON point_assets;
CREATE POLICY point_assets_service ON point_assets FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- ── Operations ──
ALTER TABLE operations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS operations_select ON operations;
CREATE POLICY operations_select ON operations FOR SELECT USING (user_has_property_access(property_id));
DROP POLICY IF EXISTS operations_insert ON operations;
CREATE POLICY operations_insert ON operations FOR INSERT WITH CHECK (user_has_property_access(property_id));
DROP POLICY IF EXISTS operations_update ON operations;
CREATE POLICY operations_update ON operations FOR UPDATE USING (user_has_property_access(property_id));
DROP POLICY IF EXISTS operations_delete ON operations;
CREATE POLICY operations_delete ON operations FOR DELETE USING (user_has_property_access(property_id));
DROP POLICY IF EXISTS operations_service ON operations;
CREATE POLICY operations_service ON operations FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- ── Observations ──
ALTER TABLE observations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS observations_select ON observations;
CREATE POLICY observations_select ON observations FOR SELECT USING (user_has_property_access(property_id));
DROP POLICY IF EXISTS observations_insert ON observations;
CREATE POLICY observations_insert ON observations FOR INSERT WITH CHECK (user_has_property_access(property_id));
DROP POLICY IF EXISTS observations_update ON observations;
CREATE POLICY observations_update ON observations FOR UPDATE USING (user_has_property_access(property_id));
DROP POLICY IF EXISTS observations_delete ON observations;
CREATE POLICY observations_delete ON observations FOR DELETE USING (user_has_property_access(property_id));
DROP POLICY IF EXISTS observations_service ON observations;
CREATE POLICY observations_service ON observations FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- ── Livestock ──
ALTER TABLE livestock ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS livestock_select ON livestock;
CREATE POLICY livestock_select ON livestock FOR SELECT USING (user_has_property_access(property_id));
DROP POLICY IF EXISTS livestock_insert ON livestock;
CREATE POLICY livestock_insert ON livestock FOR INSERT WITH CHECK (user_has_property_access(property_id));
DROP POLICY IF EXISTS livestock_update ON livestock;
CREATE POLICY livestock_update ON livestock FOR UPDATE USING (user_has_property_access(property_id));
DROP POLICY IF EXISTS livestock_delete ON livestock;
CREATE POLICY livestock_delete ON livestock FOR DELETE USING (user_has_property_access(property_id));
DROP POLICY IF EXISTS livestock_service ON livestock;
CREATE POLICY livestock_service ON livestock FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- ── Devices ──
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS devices_select ON devices;
CREATE POLICY devices_select ON devices FOR SELECT USING (user_has_property_access(property_id));
DROP POLICY IF EXISTS devices_insert ON devices;
CREATE POLICY devices_insert ON devices FOR INSERT WITH CHECK (user_has_property_access(property_id));
DROP POLICY IF EXISTS devices_update ON devices;
CREATE POLICY devices_update ON devices FOR UPDATE USING (user_has_property_access(property_id));
DROP POLICY IF EXISTS devices_delete ON devices;
CREATE POLICY devices_delete ON devices FOR DELETE USING (user_has_property_access(property_id));
DROP POLICY IF EXISTS devices_service ON devices;
CREATE POLICY devices_service ON devices FOR ALL USING (auth.jwt()->>'role' = 'service_role');


-- ─────────────────────────────────────────────────────────────────────────
-- 11. ROW LEVEL SECURITY — INDIRECT CHILDREN
-- ─────────────────────────────────────────────────────────────────────────

-- ── Sensor Readings (via devices → property_id) ──
ALTER TABLE sensor_readings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sensor_readings_select ON sensor_readings;
CREATE POLICY sensor_readings_select ON sensor_readings FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM devices d
        WHERE d.id = sensor_readings.device_id
        AND user_has_property_access(d.property_id)
    ));

-- Inserts only via service role (edge function ingest)
DROP POLICY IF EXISTS sensor_readings_service ON sensor_readings;
CREATE POLICY sensor_readings_service ON sensor_readings FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

-- ── Livestock Events (via livestock → property_id) ──
ALTER TABLE livestock_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS livestock_events_select ON livestock_events;
CREATE POLICY livestock_events_select ON livestock_events FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM livestock l
        WHERE l.id = livestock_events.livestock_id
        AND user_has_property_access(l.property_id)
    ));

DROP POLICY IF EXISTS livestock_events_insert ON livestock_events;
CREATE POLICY livestock_events_insert ON livestock_events FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM livestock l
        WHERE l.id = livestock_events.livestock_id
        AND user_has_property_access(l.property_id)
    ));

DROP POLICY IF EXISTS livestock_events_update ON livestock_events;
CREATE POLICY livestock_events_update ON livestock_events FOR UPDATE
    USING (EXISTS (
        SELECT 1 FROM livestock l
        WHERE l.id = livestock_events.livestock_id
        AND user_has_property_access(l.property_id)
    ));

DROP POLICY IF EXISTS livestock_events_delete ON livestock_events;
CREATE POLICY livestock_events_delete ON livestock_events FOR DELETE
    USING (EXISTS (
        SELECT 1 FROM livestock l
        WHERE l.id = livestock_events.livestock_id
        AND user_has_property_access(l.property_id)
    ));

DROP POLICY IF EXISTS livestock_events_service ON livestock_events;
CREATE POLICY livestock_events_service ON livestock_events FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

-- ── EID Tags (via livestock → property_id) ──
ALTER TABLE eid_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS eid_tags_select ON eid_tags;
CREATE POLICY eid_tags_select ON eid_tags FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM livestock l
        WHERE l.id = eid_tags.livestock_id
        AND user_has_property_access(l.property_id)
    ));

DROP POLICY IF EXISTS eid_tags_insert ON eid_tags;
CREATE POLICY eid_tags_insert ON eid_tags FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM livestock l
        WHERE l.id = eid_tags.livestock_id
        AND user_has_property_access(l.property_id)
    ));

DROP POLICY IF EXISTS eid_tags_service ON eid_tags;
CREATE POLICY eid_tags_service ON eid_tags FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

-- ── Media (via observations → property_id) ──
ALTER TABLE media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS media_select ON media;
CREATE POLICY media_select ON media FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM observations o
        WHERE o.id = media.observation_id
        AND user_has_property_access(o.property_id)
    ));

DROP POLICY IF EXISTS media_insert ON media;
CREATE POLICY media_insert ON media FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM observations o
        WHERE o.id = media.observation_id
        AND user_has_property_access(o.property_id)
    ));

DROP POLICY IF EXISTS media_service ON media;
CREATE POLICY media_service ON media FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

-- ── Observation Tags (via observations → property_id) ──
-- These tables may have been created via Supabase dashboard.
-- Wrap in DO block to handle case where they don't exist.
DO $$ BEGIN
    ALTER TABLE observation_tags ENABLE ROW LEVEL SECURITY;

    EXECUTE 'DROP POLICY IF EXISTS obs_tags_select ON observation_tags';
    EXECUTE 'CREATE POLICY obs_tags_select ON observation_tags FOR SELECT
        USING (EXISTS (
            SELECT 1 FROM observations o
            WHERE o.id = observation_tags.observation_id
            AND user_has_property_access(o.property_id)
        ))';

    EXECUTE 'DROP POLICY IF EXISTS obs_tags_insert ON observation_tags';
    EXECUTE 'CREATE POLICY obs_tags_insert ON observation_tags FOR INSERT
        WITH CHECK (EXISTS (
            SELECT 1 FROM observations o
            WHERE o.id = observation_tags.observation_id
            AND user_has_property_access(o.property_id)
        ))';

    EXECUTE 'DROP POLICY IF EXISTS obs_tags_delete ON observation_tags';
    EXECUTE 'CREATE POLICY obs_tags_delete ON observation_tags FOR DELETE
        USING (EXISTS (
            SELECT 1 FROM observations o
            WHERE o.id = observation_tags.observation_id
            AND user_has_property_access(o.property_id)
        ))';

    EXECUTE 'DROP POLICY IF EXISTS obs_tags_service ON observation_tags';
    EXECUTE 'CREATE POLICY obs_tags_service ON observation_tags FOR ALL
        USING (auth.jwt()->>''role'' = ''service_role'')';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;


-- ─────────────────────────────────────────────────────────────────────────
-- 12. ROW LEVEL SECURITY — GLOBAL REFERENCE TABLES (read-only for auth'd)
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE device_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS device_types_select ON device_types;
CREATE POLICY device_types_select ON device_types FOR SELECT
    USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS device_types_service ON device_types;
CREATE POLICY device_types_service ON device_types FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

ALTER TABLE livestock_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS livestock_types_select ON livestock_types;
CREATE POLICY livestock_types_select ON livestock_types FOR SELECT
    USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS livestock_types_service ON livestock_types;
CREATE POLICY livestock_types_service ON livestock_types FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

ALTER TABLE breeds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS breeds_select ON breeds;
CREATE POLICY breeds_select ON breeds FOR SELECT
    USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS breeds_service ON breeds;
CREATE POLICY breeds_service ON breeds FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

-- ── Observation Tag Types (mixed: global + property-scoped) ──
DO $$ BEGIN
    ALTER TABLE observation_tag_types ENABLE ROW LEVEL SECURITY;

    EXECUTE 'DROP POLICY IF EXISTS tag_types_select ON observation_tag_types';
    EXECUTE 'CREATE POLICY tag_types_select ON observation_tag_types FOR SELECT
        USING (
            property_id IS NULL
            OR user_has_property_access(property_id)
        )';

    EXECUTE 'DROP POLICY IF EXISTS tag_types_insert ON observation_tag_types';
    EXECUTE 'CREATE POLICY tag_types_insert ON observation_tag_types FOR INSERT
        WITH CHECK (
            property_id IS NULL
            OR user_has_property_access(property_id)
        )';

    EXECUTE 'DROP POLICY IF EXISTS tag_types_service ON observation_tag_types';
    EXECUTE 'CREATE POLICY tag_types_service ON observation_tag_types FOR ALL
        USING (auth.jwt()->>''role'' = ''service_role'')';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;


-- ─────────────────────────────────────────────────────────────────────────
-- 13. REFRESH VIEWS to include owner_id and created_by
-- ─────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS properties_geo CASCADE;
CREATE VIEW properties_geo AS
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

-- Refresh observations_geo to include created_by
DROP VIEW IF EXISTS observations_geo CASCADE;
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
    o.created_by,
    o.created_at,
    ST_AsGeoJSON(o.geom)::json AS geom
FROM observations o;

-- Refresh areas_geo (depends on livestock_alive_counts which was dropped by CASCADE)
-- First re-create livestock_alive_counts if it was dropped
DROP VIEW IF EXISTS livestock_alive_counts CASCADE;
CREATE VIEW livestock_alive_counts AS
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

DROP VIEW IF EXISTS livestock_camp_counts CASCADE;
CREATE VIEW livestock_camp_counts AS
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

DROP VIEW IF EXISTS areas_geo CASCADE;
CREATE VIEW areas_geo AS
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


-- ══════════════════════════════════════════════════════════════════════════
-- POST-MIGRATION STEPS (run manually after first owner signs up):
--
-- 1. UPDATE properties SET owner_id = '<owner-uuid>' WHERE owner_id IS NULL;
-- 2. INSERT INTO property_members (property_id, user_id, role, is_admin, status)
--    SELECT id, '<owner-uuid>', 'owner', TRUE, 'approved' FROM properties;
-- 3. ALTER TABLE properties ALTER COLUMN owner_id SET NOT NULL;
-- ══════════════════════════════════════════════════════════════════════════
