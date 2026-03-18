-- ══════════════════════════════════════════════════════════════════════════
-- LANDMAN: Security Hardening (Part 3) — Final cleanup
-- Fixes remaining: create_area search_path + observation tag RLS warnings
-- Run in Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────
-- 1. FORCE create_area: DROP + recreate to ensure SET search_path sticks
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS create_area(uuid, text, uuid, text, text, text, json);

CREATE FUNCTION create_area(
    p_property_id uuid,
    p_name        text,
    p_parent_id   uuid DEFAULT NULL,
    p_level       text DEFAULT 'camp',
    p_type        text DEFAULT NULL,
    p_notes       text DEFAULT NULL,
    p_boundary    json DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;


-- ─────────────────────────────────────────────────────────────────────────
-- 2. FIX observation_tag_types RLS — drop ALL policies and recreate
--    The advisor flags "always true" when any branch is unconditional.
--    Solution: require authenticated role explicitly via auth.role().
-- ─────────────────────────────────────────────────────────────────────────

-- Nuke all existing policies on observation_tag_types
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname FROM pg_policies
        WHERE tablename = 'observation_tag_types' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON observation_tag_types', pol.policyname);
    END LOOP;
END $$;

-- Recreate tight policies
-- SELECT: authenticated users see global tags + tags for properties they can access
CREATE POLICY "tag_types_select" ON observation_tag_types FOR SELECT TO authenticated
    USING (
        user_has_property_access(COALESCE(property_id, (
            SELECT id FROM properties LIMIT 1
        )))
        OR property_id IS NULL
    );

-- Actually, simpler approach: just gate on authenticated role
DROP POLICY IF EXISTS "tag_types_select" ON observation_tag_types;
CREATE POLICY "tag_types_select" ON observation_tag_types FOR SELECT TO authenticated
    USING (
        property_id IS NULL
        OR user_has_property_access(property_id)
    );

-- INSERT: only users with property access can create tag types
CREATE POLICY "tag_types_insert" ON observation_tag_types FOR INSERT TO authenticated
    WITH CHECK (user_has_property_access(property_id));

-- UPDATE: only users with property access
CREATE POLICY "tag_types_update" ON observation_tag_types FOR UPDATE TO authenticated
    USING (user_has_property_access(property_id))
    WITH CHECK (user_has_property_access(property_id));

-- DELETE: only users with property access
CREATE POLICY "tag_types_delete" ON observation_tag_types FOR DELETE TO authenticated
    USING (user_has_property_access(property_id));

-- Service role: full access
CREATE POLICY "tag_types_service" ON observation_tag_types FOR ALL TO service_role
    USING (true) WITH CHECK (true);


-- ─────────────────────────────────────────────────────────────────────────
-- 3. FIX observation_tags RLS — same approach
-- ─────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname FROM pg_policies
        WHERE tablename = 'observation_tags' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON observation_tags', pol.policyname);
    END LOOP;
END $$;

-- SELECT: user must have access to the observation's property
CREATE POLICY "obs_tags_select" ON observation_tags FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM observations o
            WHERE o.id = observation_tags.observation_id
            AND user_has_property_access(o.property_id)
        )
    );

-- INSERT
CREATE POLICY "obs_tags_insert" ON observation_tags FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM observations o
            WHERE o.id = observation_tags.observation_id
            AND user_has_property_access(o.property_id)
        )
    );

-- DELETE
CREATE POLICY "obs_tags_delete" ON observation_tags FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM observations o
            WHERE o.id = observation_tags.observation_id
            AND user_has_property_access(o.property_id)
        )
    );

-- Service role: full access
CREATE POLICY "obs_tags_service" ON observation_tags FOR ALL TO service_role
    USING (true) WITH CHECK (true);


-- ══════════════════════════════════════════════════════════════════════════
-- Expected after running:
--   Errors:   0
--   Warnings: 2 (postgis in public + leaked password protection)
-- ══════════════════════════════════════════════════════════════════════════
