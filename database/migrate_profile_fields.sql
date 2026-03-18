-- ══════════════════════════════════════════════════════════════════════════
-- LANDMAN: Extend profiles with personal details + secure access
-- Run in Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────
-- 1. ADD COLUMNS TO PROFILES
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone              TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS id_number          TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS selfie_url         TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS drivers_license_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS address            TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS emergency_contact  TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS emergency_phone    TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS date_of_birth      DATE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notes              TEXT;


-- ─────────────────────────────────────────────────────────────────────────
-- 2. SECURE PROFILE ACCESS FUNCTION
--    Returns full profile for self or admin, limited for co-members.
--    This replaces the view approach — uses a function so we can
--    check admin status and conditionally mask sensitive fields.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_user_profile(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller    UUID := auth.uid();
    v_is_self   BOOLEAN;
    v_is_admin  BOOLEAN := FALSE;
    v_profile   RECORD;
    v_membership RECORD;
BEGIN
    -- Check if viewing own profile
    v_is_self := (v_caller = p_user_id);

    -- Check if caller is admin of any shared property
    IF NOT v_is_self THEN
        SELECT TRUE INTO v_is_admin
        FROM property_members pm_caller
        JOIN property_members pm_target
            ON pm_caller.property_id = pm_target.property_id
        WHERE pm_caller.user_id = v_caller
          AND pm_target.user_id = p_user_id
          AND pm_caller.status = 'approved'
          AND pm_caller.is_admin = TRUE
        LIMIT 1;

        v_is_admin := COALESCE(v_is_admin, FALSE);

        -- Verify caller is at least a co-member
        IF NOT v_is_admin THEN
            PERFORM 1 FROM property_members pm_caller
            JOIN property_members pm_target
                ON pm_caller.property_id = pm_target.property_id
            WHERE pm_caller.user_id = v_caller
              AND pm_target.user_id = p_user_id
              AND pm_caller.status = 'approved';
            IF NOT FOUND THEN
                RETURN NULL; -- no access at all
            END IF;
        END IF;
    END IF;

    -- Get profile
    SELECT * INTO v_profile FROM profiles WHERE id = p_user_id;
    IF NOT FOUND THEN RETURN NULL; END IF;

    -- Get membership info (first shared property)
    SELECT pm.role, pm.is_admin, pm.status, pm.id AS membership_id
    INTO v_membership
    FROM property_members pm
    WHERE pm.user_id = p_user_id
    LIMIT 1;

    -- Self or admin: return full profile
    IF v_is_self OR v_is_admin THEN
        RETURN json_build_object(
            'id',                  v_profile.id,
            'email',               v_profile.email,
            'full_name',           v_profile.full_name,
            'phone',               v_profile.phone,
            'id_number',           v_profile.id_number,
            'selfie_url',          v_profile.selfie_url,
            'drivers_license_url', v_profile.drivers_license_url,
            'address',             v_profile.address,
            'emergency_contact',   v_profile.emergency_contact,
            'emergency_phone',     v_profile.emergency_phone,
            'date_of_birth',       v_profile.date_of_birth,
            'notes',               v_profile.notes,
            'created_at',          v_profile.created_at,
            'updated_at',          v_profile.updated_at,
            'role',                v_membership.role,
            'is_admin',            v_membership.is_admin,
            'status',              v_membership.status,
            'membership_id',       v_membership.membership_id,
            'access_level',        CASE WHEN v_is_self THEN 'self' ELSE 'admin' END
        );
    END IF;

    -- Co-member (not admin): limited fields only
    RETURN json_build_object(
        'id',            v_profile.id,
        'email',         v_profile.email,
        'full_name',     v_profile.full_name,
        'phone',         v_profile.phone,
        'created_at',    v_profile.created_at,
        'role',          v_membership.role,
        'is_admin',      v_membership.is_admin,
        'status',        v_membership.status,
        'membership_id', v_membership.membership_id,
        'access_level',  'member'
    );
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────
-- 3. DROP THE INSECURE VIEW (if it was already created)
-- ─────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS property_user_profiles;


-- ─────────────────────────────────────────────────────────────────────────
-- 4. FIX search_path ON EXISTING AUTH HELPERS
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION user_has_property_access(prop_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM property_members
        WHERE property_id = prop_id
        AND user_id = auth.uid()
        AND status = 'approved'
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

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


-- ─────────────────────────────────────────────────────────────────────────
-- 5. STORAGE BUCKET POLICIES (run separately in Dashboard if needed)
--    Bucket: profile-images (PRIVATE, not public)
--
--    Policy 1: Users can upload to their own folder
--      INSERT: bucket_id = 'profile-images'
--              AND (storage.foldername(name))[1] = auth.uid()::text
--
--    Policy 2: Users can read own images; admins can read co-member images
--      SELECT: bucket_id = 'profile-images'
--              AND (
--                  (storage.foldername(name))[1] = auth.uid()::text
--                  OR user_is_property_admin_of_user(
--                      ((storage.foldername(name))[1])::uuid
--                  )
--              )
--
--    Policy 3: Users can update/delete own images
--      UPDATE/DELETE: bucket_id = 'profile-images'
--              AND (storage.foldername(name))[1] = auth.uid()::text
-- ─────────────────────────────────────────────────────────────────────────

-- Helper: is caller an admin of a property that target_user belongs to?
CREATE OR REPLACE FUNCTION user_is_property_admin_of_user(target_user_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1
        FROM property_members pm_caller
        JOIN property_members pm_target
            ON pm_caller.property_id = pm_target.property_id
        WHERE pm_caller.user_id = auth.uid()
          AND pm_target.user_id = target_user_id
          AND pm_caller.status = 'approved'
          AND pm_caller.is_admin = TRUE
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;


-- ══════════════════════════════════════════════════════════════════════════
-- AFTER RUNNING THIS:
-- 1. Create storage bucket: Storage → New Bucket → "profile-images" → PRIVATE
-- 2. Add storage policies in Dashboard → Storage → profile-images → Policies:
--    a) INSERT (upload): auth.uid()::text = (storage.foldername(name))[1]
--    b) SELECT (read):   auth.uid()::text = (storage.foldername(name))[1]
--                        OR user_is_property_admin_of_user(((storage.foldername(name))[1])::uuid)
--    c) UPDATE/DELETE:   auth.uid()::text = (storage.foldername(name))[1]
-- ══════════════════════════════════════════════════════════════════════════
