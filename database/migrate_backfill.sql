-- ──────────────────────────────────────────────────────────────────────────
-- LANDMAN: backfill_device_readings(p_device_id UUID)
--
-- Re-parses stored raw JSONB for all sensor_readings of a given device
-- that are missing normalised lat/lng/battery/rssi/snr values.
-- Call this after assigning a device_type_id (registering the device).
--
-- Returns: INTEGER — number of rows updated
--
-- The PostGIS trigger trg_sensor_readings_geom fires on UPDATE, so any
-- newly-written lat/lng automatically populates geom as well.
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION backfill_device_readings(p_device_id UUID)
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER := 0;
  r             RECORD;
  v_msg         JSONB;
  v_dp          JSONB;
  v_lat         DOUBLE PRECISION;
  v_lng         DOUBLE PRECISION;
  v_bat         SMALLINT;
  v_rssi        SMALLINT;
  v_snr         REAL;
  v_extra       JSONB;
  v_has_fix     BOOLEAN;
BEGIN
  FOR r IN
    SELECT id, raw
    FROM   sensor_readings
    WHERE  device_id = p_device_id
      AND  (lat IS NULL OR battery_pct IS NULL)
  LOOP
    -- Support both TTN data-wrapped format (body.data.uplink_message)
    -- and flat format (body.uplink_message)
    v_msg := COALESCE(
      r.raw->'data'->'uplink_message',
      r.raw->'uplink_message'
    );

    IF v_msg IS NULL THEN CONTINUE; END IF;

    v_dp    := v_msg->'decoded_payload';
    v_lat   := NULL;
    v_lng   := NULL;
    v_bat   := NULL;
    v_rssi  := NULL;
    v_snr   := NULL;
    v_extra := NULL;

    -- RSSI / SNR from first rx_metadata entry
    v_rssi := (v_msg->'rx_metadata'->0->>'rssi')::SMALLINT;
    v_snr  := (v_msg->'rx_metadata'->0->>'snr')::REAL;

    IF v_dp IS NOT NULL THEN
      -- Battery
      v_bat := NULLIF(v_dp->>'battery_pct', 'null')::SMALLINT;

      -- GPS from decoded_payload when has_fix = true
      v_has_fix := (NULLIF(v_dp->>'has_fix', 'null'))::BOOLEAN;
      IF v_has_fix IS TRUE THEN
        v_lat := NULLIF(v_dp->>'lat', 'null')::DOUBLE PRECISION;
        v_lng := NULLIF(v_dp->>'lon', 'null')::DOUBLE PRECISION;
      END IF;

      -- Extra fields
      v_extra := '{}'::JSONB;
      IF NULLIF(v_dp->>'ic_temp_c', 'null') IS NOT NULL THEN
        v_extra := v_extra || jsonb_build_object('temperature_c', (v_dp->>'ic_temp_c')::NUMERIC);
      END IF;
      IF v_has_fix IS NOT NULL THEN
        v_extra := v_extra || jsonb_build_object('has_fix', v_has_fix);
      END IF;
      IF v_extra = '{}'::JSONB THEN v_extra := NULL; END IF;
    END IF;

    -- Fallback GPS: TTN network-estimated location from frm-payload
    IF v_lat IS NULL AND v_msg->'locations'->'frm-payload' IS NOT NULL THEN
      v_lat := (v_msg->'locations'->'frm-payload'->>'latitude')::DOUBLE PRECISION;
      v_lng := (v_msg->'locations'->'frm-payload'->>'longitude')::DOUBLE PRECISION;
    END IF;

    -- Only write the row if we extracted at least one new value
    IF v_lat IS NOT NULL OR v_bat IS NOT NULL OR v_rssi IS NOT NULL THEN
      UPDATE sensor_readings SET
        lat         = COALESCE(v_lat,  lat),
        lng         = COALESCE(v_lng,  lng),
        battery_pct = COALESCE(v_bat,  battery_pct),
        rssi        = COALESCE(v_rssi, rssi),
        snr         = COALESCE(v_snr,  snr),
        extra       = COALESCE(v_extra, extra)
      WHERE id = r.id;

      updated_count := updated_count + 1;
    END IF;
  END LOOP;

  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;
