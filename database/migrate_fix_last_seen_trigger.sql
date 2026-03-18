-- ──────────────────────────────────────────────────────────────────────────
-- LANDMAN: Fix devices_update_last_seen trigger
-- Run in Supabase SQL Editor
--
-- Bug: The trigger was unconditionally setting last_lat/last_lng/last_battery_pct
-- from every new reading. When a heartbeat-only reading arrives (no GPS fix),
-- lat/lng are NULL, which overwrites the device's last known good position.
--
-- Fix: Use COALESCE so NULL readings preserve the previous value.
-- ──────────────────────────────────────────────────────────────────────────

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
