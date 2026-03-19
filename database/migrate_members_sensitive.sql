-- ══════════════════════════════════════════════════════════════════════════
-- LANDMAN: Hide sensitive property_members fields from non-admins
--
-- The members_select RLS policy grants all approved members SELECT access
-- to the full property_members row, including pin and join_token fields.
-- Since RLS is row-level only, we use a secure view to mask these columns
-- for non-admin users.
--
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ══════════════════════════════════════════════════════════════════════════

-- Secure view: only admins see pin and join_token
CREATE OR REPLACE VIEW property_members_safe
WITH (security_invoker = true) AS
SELECT
    id,
    property_id,
    user_id,
    role,
    is_admin,
    status,
    CASE WHEN user_is_property_admin(property_id) THEN pin        ELSE NULL END AS pin,
    CASE WHEN user_is_property_admin(property_id) THEN join_token  ELSE NULL END AS join_token,
    created_at
FROM property_members;

-- Grant the same access as the underlying table
GRANT SELECT ON property_members_safe TO authenticated;
