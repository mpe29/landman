-- ──────────────────────────────────────────────────────────────────────────
-- LANDMAN: Routing Device Support (Gateways, Starlinks, Relays)
-- Run in Supabase SQL Editor after migrate_devices.sql
--
-- Adds:
--   1. 'routing' device type seed for LoRaWAN gateways
--   2. gateway_id column on sensor_readings (TEXT, loose FK to routing device EUI)
--   3. Composite index for time-filtered device queries
--   4. routing_log view for "which end devices pinged through this gateway?"
-- ──────────────────────────────────────────────────────────────────────────

-- ---------------------------------------------------------------------------
-- Routing device type: LoRaWAN Gateway
-- Category 'routing' is broad: covers gateways, Starlinks, cellular relays,
-- mesh repeaters. Sub-types distinguished by device_type name/protocol.
-- ---------------------------------------------------------------------------
INSERT INTO device_types (name, manufacturer, protocol, category, icon, description)
VALUES (
    'LoRaWAN Gateway',
    NULL,
    'lorawan',
    'routing',
    '🗼',
    'LoRaWAN network gateway. Auto-discovered from TTN rx_metadata.'
) ON CONFLICT DO NOTHING;


-- ---------------------------------------------------------------------------
-- gateway_id on sensor_readings
-- Stores the EUI of the routing device that relayed this reading.
-- TEXT (not FK) because readings may arrive before the gateway device record
-- exists. The loose relationship is intentional.
-- ---------------------------------------------------------------------------
ALTER TABLE sensor_readings
ADD COLUMN IF NOT EXISTS gateway_id TEXT;

CREATE INDEX IF NOT EXISTS idx_sensor_readings_gateway
ON sensor_readings(gateway_id);


-- ---------------------------------------------------------------------------
-- Composite index: device + time
-- Speeds up time-filtered queries (device trail / heatmap).
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_sensor_readings_device_time
ON sensor_readings(device_id, received_at DESC);


-- ---------------------------------------------------------------------------
-- View: routing_log
-- Shows all sensor readings that passed through a known routing device.
-- Query pattern: SELECT * FROM routing_log WHERE gateway_id = '<eui>'
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW routing_log AS
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
