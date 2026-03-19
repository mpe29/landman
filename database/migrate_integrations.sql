-- ══════════════════════════════════════════════════════════════════════════
-- LANDMAN: Property Integrations (Multi-Platform Webhook Management)
-- Run in Supabase SQL Editor (Dashboard > SQL Editor > New query)
--
-- Creates: property_integrations table with RLS
-- Migrates: assigns orphaned devices to the existing property
-- ══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────
-- 1. PROPERTY INTEGRATIONS TABLE
-- One row per property-platform combination. Stores hashed webhook tokens.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS property_integrations (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id          UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    platform             TEXT NOT NULL CHECK (platform IN ('ttn', 'blues', 'http')),
    enabled              BOOLEAN NOT NULL DEFAULT TRUE,
    webhook_token        TEXT NOT NULL,           -- SHA-256 hex hash of plaintext token
    webhook_token_prefix TEXT NOT NULL,           -- first 8 chars of plaintext for display
    label                TEXT,                    -- user-friendly name e.g. "Main TTN App"
    last_message_at      TIMESTAMPTZ,
    message_count        BIGINT NOT NULL DEFAULT 0,
    metadata             JSONB,                  -- platform-specific config
    created_at           TIMESTAMPTZ DEFAULT NOW(),
    created_by           UUID REFERENCES profiles(id),
    UNIQUE (property_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_property_integrations_property
    ON property_integrations(property_id);

CREATE INDEX IF NOT EXISTS idx_property_integrations_token
    ON property_integrations(webhook_token);


-- ─────────────────────────────────────────────────────────────────────────
-- 2. ROW LEVEL SECURITY
-- SELECT: any approved property member
-- INSERT/UPDATE/DELETE: property admins only
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE property_integrations ENABLE ROW LEVEL SECURITY;

-- Allow service_role full access (used by Edge Functions)
CREATE POLICY integrations_service ON property_integrations FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

-- Members can view integrations for their properties
CREATE POLICY integrations_select ON property_integrations FOR SELECT
    USING (user_has_property_access(property_id));

-- Only admins can create integrations
CREATE POLICY integrations_insert ON property_integrations FOR INSERT
    WITH CHECK (user_is_property_admin(property_id));

-- Only admins can update integrations
CREATE POLICY integrations_update ON property_integrations FOR UPDATE
    USING (user_is_property_admin(property_id))
    WITH CHECK (user_is_property_admin(property_id));

-- Only admins can delete integrations
CREATE POLICY integrations_delete ON property_integrations FOR DELETE
    USING (user_is_property_admin(property_id));


-- ─────────────────────────────────────────────────────────────────────────
-- 3. DATA MIGRATION: Assign orphaned devices to existing property
-- All current devices (T1000s, gateways) get linked to the sole property.
-- Historical sensor_readings follow automatically via device_id FK + RLS.
-- ─────────────────────────────────────────────────────────────────────────

UPDATE devices
SET property_id = (SELECT id FROM properties ORDER BY created_at LIMIT 1)
WHERE property_id IS NULL;
