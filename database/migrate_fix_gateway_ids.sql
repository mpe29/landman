-- ══════════════════════════════════════════════════════════════════════════
-- LANDMAN: Fix gateway_id in sensor_readings to match device dev_eui
--
-- Problem: sensor_readings.gateway_id stored TTN's human-readable gateway_id
-- (e.g. "godspeed-ranch-gw") but gateway devices are registered with dev_eui
-- set to the EUI (e.g. "a84041ffff123456"). The routing_log query by dev_eui
-- found no matches.
--
-- Fix: update sensor_readings.gateway_id to use the EUI where the gateway
-- device has an EUI stored in metadata.
--
-- Run in Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════════════════

-- Update sensor_readings.gateway_id from TTN gateway_id → device dev_eui
-- where they differ (gateway was registered with EUI as dev_eui)
UPDATE sensor_readings sr
SET gateway_id = d.dev_eui
FROM devices d
WHERE d.metadata->>'gateway_id' = sr.gateway_id
  AND d.dev_eui != sr.gateway_id
  AND d.device_types IS NOT NULL;

-- Simpler approach: match via device metadata
UPDATE sensor_readings sr
SET gateway_id = d.dev_eui
FROM devices d
JOIN device_types dt ON dt.id = d.device_type_id
WHERE dt.category = 'routing'
  AND d.metadata->>'gateway_id' = sr.gateway_id
  AND d.dev_eui != sr.gateway_id;
