-- ──────────────────────────────────────────────────────────────────────────
-- LANDMAN: IoT Device & Sensor Readings
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query)
--
-- Three tables:
--   device_types   — one row per hardware model (Seeed T1000, Dragino, etc.)
--   devices        — one row per physical unit on the ground
--   sensor_readings — one row per inbound webhook / uplink
--
-- Two triggers keep devices.last_* columns current so the map never needs
-- a GROUP BY subquery to show current positions.
-- ──────────────────────────────────────────────────────────────────────────


-- ---------------------------------------------------------------------------
-- device_types
-- Catalog of known sensor/tracker models.
-- Adding a new hardware model = one INSERT here + a small parser block in the
-- edge function. field_map JSONB reserved for future data-driven parsing.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS device_types (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT        NOT NULL,        -- "Seeed SenseCAP T1000-E"
    manufacturer TEXT,                        -- "Seeed Studio"
    protocol     TEXT,                        -- lorawan | lte | sigfox | nb-iot | wifi | http
    category     TEXT,                        -- gps_tracker | environment | water_level | door_sensor | other
    icon         TEXT,                        -- emoji shown in UI
    description  TEXT,
    field_map    JSONB,                       -- JSONPath field mapping hints (future use)
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Seed: first known device type
INSERT INTO device_types (name, manufacturer, protocol, category, icon, description)
VALUES (
    'SenseCAP T1000-E',
    'Seeed Studio',
    'lorawan',
    'gps_tracker',
    '📡',
    'LoRaWAN GPS tracker with battery, light and temperature sensors. Livestock/asset tracking.'
)
ON CONFLICT DO NOTHING;


-- ---------------------------------------------------------------------------
-- devices
-- One row per physical unit. Links to type, property, area (camp), and
-- optionally to a fixed point_asset (e.g. a dam sensor).
-- Starts active=false until the user confirms and names the device.
-- last_* columns are denormalised from sensor_readings by trigger for fast
-- map queries without subqueries.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS devices (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    device_type_id  UUID        REFERENCES device_types(id)  ON DELETE SET NULL,
    property_id     UUID        REFERENCES properties(id)    ON DELETE SET NULL,
    area_id         UUID        REFERENCES areas(id)         ON DELETE SET NULL,
    point_asset_id  UUID        REFERENCES point_assets(id)  ON DELETE SET NULL,
    name            TEXT        NOT NULL DEFAULT 'Unknown Device',
    dev_eui         TEXT        UNIQUE,       -- hardware EUI (LoRa) or serial ID
    active          BOOLEAN     NOT NULL DEFAULT FALSE,
    notes           TEXT,
    metadata        JSONB,                    -- network config: app_id, port, etc.
    -- Denormalised last-known state (kept current by trigger below)
    last_seen_at    TIMESTAMPTZ,
    last_lat        DOUBLE PRECISION,
    last_lng        DOUBLE PRECISION,
    last_battery_pct SMALLINT,               -- 0–100
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_devices_type       ON devices(device_type_id);
CREATE INDEX IF NOT EXISTS idx_devices_property   ON devices(property_id);
CREATE INDEX IF NOT EXISTS idx_devices_area       ON devices(area_id);
CREATE INDEX IF NOT EXISTS idx_devices_dev_eui    ON devices(dev_eui);


-- ---------------------------------------------------------------------------
-- sensor_readings
-- One row per inbound webhook/uplink.
-- raw JSONB preserves the complete original payload — never modified.
-- Normalised fields extracted by the edge function when device type is known;
-- otherwise only raw is populated (no data is ever lost).
-- geom is auto-set from lat/lng by trigger.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sensor_readings (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id    UUID        NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    received_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    device_time  TIMESTAMPTZ,                -- device-reported timestamp (may differ)
    raw          JSONB       NOT NULL,        -- full payload — never touch after insert
    -- Spatial
    lat          DOUBLE PRECISION,
    lng          DOUBLE PRECISION,
    geom         GEOMETRY(POINT, 4326),       -- auto-set by trigger
    -- Telemetry (standard across most devices)
    battery_pct  SMALLINT,                   -- 0–100
    rssi         SMALLINT,                   -- dBm signal strength
    snr          REAL,                       -- signal-to-noise ratio (LoRa)
    -- Device-specific extras: temperature, light_lux, water_level_mm, etc.
    extra        JSONB
);

CREATE INDEX IF NOT EXISTS idx_sensor_readings_device   ON sensor_readings(device_id);
CREATE INDEX IF NOT EXISTS idx_sensor_readings_received ON sensor_readings(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_sensor_readings_geom     ON sensor_readings USING GIST(geom);


-- ---------------------------------------------------------------------------
-- Trigger 1: auto-compute geom from lat/lng on INSERT or UPDATE
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sensor_readings_set_geom()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
        NEW.geom = ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sensor_readings_geom ON sensor_readings;
CREATE TRIGGER trg_sensor_readings_geom
    BEFORE INSERT OR UPDATE ON sensor_readings
    FOR EACH ROW EXECUTE FUNCTION sensor_readings_set_geom();


-- ---------------------------------------------------------------------------
-- Trigger 2: keep devices.last_* columns current after each new reading.
-- Only updates if the new reading is more recent than the stored one,
-- so out-of-order deliveries don't overwrite a newer position.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION devices_update_last_seen()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE devices
    SET
        last_seen_at     = NEW.received_at,
        -- Only overwrite position when the new reading has coordinates;
        -- heartbeat-only readings (no GPS fix) must not null out a good position.
        last_lat         = COALESCE(NEW.lat, last_lat),
        last_lng         = COALESCE(NEW.lng, last_lng),
        last_battery_pct = COALESCE(NEW.battery_pct, last_battery_pct)
    WHERE id = NEW.device_id
      AND (last_seen_at IS NULL OR NEW.received_at > last_seen_at);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_devices_last_seen ON sensor_readings;
CREATE TRIGGER trg_devices_last_seen
    AFTER INSERT ON sensor_readings
    FOR EACH ROW EXECUTE FUNCTION devices_update_last_seen();


-- ---------------------------------------------------------------------------
-- View: device_positions
-- Used by the frontend to render live device markers on the map.
-- Joins device type and area so the frontend needs one query only.
-- Excludes devices with no known position yet.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW device_positions AS
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
