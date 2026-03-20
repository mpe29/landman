-- ══════════════════════════════════════════════════════════════════════════
-- LANDMAN: Device Images — type product images + custom per-device photos
-- Run in Supabase SQL Editor after migrate_device_types_expand.sql
--
-- 1. Adds image_url column to device_types for stock product images
-- 2. Creates device-images public storage bucket (via dashboard)
-- 3. Storage policies for property members to upload device images
-- ══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────
-- 1. ADD image_url COLUMN TO device_types
--    Stores path to stock product image in device-images bucket.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE device_types ADD COLUMN IF NOT EXISTS image_url TEXT;


-- ─────────────────────────────────────────────────────────────────────────
-- 2. STORAGE BUCKET: create via Supabase Dashboard
--    Storage → New Bucket → "device-images" → PUBLIC
--    Allowed MIME types: image/jpeg, image/png, image/webp
-- ─────────────────────────────────────────────────────────────────────────

-- (Create bucket manually in dashboard before running storage policies below)


-- ─────────────────────────────────────────────────────────────────────────
-- 3. STORAGE POLICIES
--    - Anyone can read (public bucket)
--    - Property members can upload/update images for their devices
-- ─────────────────────────────────────────────────────────────────────────

-- Public read for all device images
DROP POLICY IF EXISTS device_images_public_select ON storage.objects;
CREATE POLICY device_images_public_select ON storage.objects FOR SELECT
    USING (bucket_id = 'device-images');

-- Property members can upload device images
-- Path convention: {deviceId}/custom.jpg, {deviceId}/thumb.jpg
-- or types/{typeId}.jpg for stock product images
DROP POLICY IF EXISTS device_images_member_insert ON storage.objects;
CREATE POLICY device_images_member_insert ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'device-images'
        AND auth.uid() IS NOT NULL
        AND (
            -- Allow uploads to device folders for devices in user's property
            EXISTS (
                SELECT 1 FROM devices d
                JOIN property_members pm ON pm.property_id = d.property_id
                WHERE d.id::text = (string_to_array(name, '/'))[1]
                  AND pm.user_id = auth.uid()
                  AND pm.status = 'approved'
            )
            -- Allow admin uploads to types/ folder
            OR (
                (string_to_array(name, '/'))[1] = 'types'
                AND EXISTS (
                    SELECT 1 FROM property_members pm
                    WHERE pm.user_id = auth.uid()
                      AND pm.is_admin = TRUE
                      AND pm.status = 'approved'
                )
            )
        )
    );

-- Property members can update/replace device images
DROP POLICY IF EXISTS device_images_member_update ON storage.objects;
CREATE POLICY device_images_member_update ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'device-images'
        AND auth.uid() IS NOT NULL
        AND (
            EXISTS (
                SELECT 1 FROM devices d
                JOIN property_members pm ON pm.property_id = d.property_id
                WHERE d.id::text = (string_to_array(name, '/'))[1]
                  AND pm.user_id = auth.uid()
                  AND pm.status = 'approved'
            )
            OR (
                (string_to_array(name, '/'))[1] = 'types'
                AND EXISTS (
                    SELECT 1 FROM property_members pm
                    WHERE pm.user_id = auth.uid()
                      AND pm.is_admin = TRUE
                      AND pm.status = 'approved'
                )
            )
        )
    );
