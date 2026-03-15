-- ──────────────────────────────────────────────────────────────────────────
-- LANDMAN: Fix devices_update_last_seen trigger
--
-- Bug: the original trigger did `last_lat = NEW.lat` which overwrites
-- a previously good GPS fix with NULL when a new reading arrives without
-- a GPS position (e.g. a battery-only heartbeat packet).  This caused
-- registered devices to disappear from the device_positions view and
-- briefly revert to "Unknown" on the map.
--
-- Fix: wrap each field in COALESCE so existing values are only replaced
-- when the new reading actually carries a value for that field.
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION devices_update_last_seen()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE devices SET
    last_seen_at     = NEW.received_at,
    last_lat         = COALESCE(NEW.lat,         last_lat),
    last_lng         = COALESCE(NEW.lng,         last_lng),
    last_battery_pct = COALESCE(NEW.battery_pct, last_battery_pct)
  WHERE id = NEW.device_id
    AND (last_seen_at IS NULL OR NEW.received_at > last_seen_at);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
