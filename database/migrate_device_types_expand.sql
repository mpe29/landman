-- ──────────────────────────────────────────────────────────────────────────
-- LANDMAN: Expand Device Type Repository
-- Run in Supabase SQL Editor after migrate_devices.sql
--
-- Adds new device types for common LoRaWAN agriculture/land-management
-- sensors, livestock ear tags, weather stations, and a generic fallback.
-- ──────────────────────────────────────────────────────────────────────────

-- Dragino LSE01 — Soil Moisture & EC Sensor
INSERT INTO device_types (name, manufacturer, protocol, category, icon, description)
VALUES (
    'Dragino LSE01',
    'Dragino',
    'lorawan',
    'environment',
    '🌱',
    'Soil moisture & EC + temperature sensor. Fields: conduct_SOIL, water_SOIL, temp_SOIL.'
) ON CONFLICT DO NOTHING;

-- Dragino LHT65N — Temperature & Humidity Sensor
INSERT INTO device_types (name, manufacturer, protocol, category, icon, description)
VALUES (
    'Dragino LHT65N',
    'Dragino',
    'lorawan',
    'environment',
    '🌡️',
    'LoRaWAN temperature & humidity sensor. Fields: TempC_SHT, Hum_SHT.'
) ON CONFLICT DO NOTHING;

-- Dragino LDDS75 — Water Level Sensor
INSERT INTO device_types (name, manufacturer, protocol, category, icon, description)
VALUES (
    'Dragino LDDS75',
    'Dragino',
    'lorawan',
    'water_level',
    '💧',
    'Ultrasonic distance/water level sensor. Fields: distance_mm.'
) ON CONFLICT DO NOTHING;

-- Dragino LDS02 — Door/Gate Sensor
INSERT INTO device_types (name, manufacturer, protocol, category, icon, description)
VALUES (
    'Dragino LDS02',
    'Dragino',
    'lorawan',
    'door_sensor',
    '🚪',
    'LoRaWAN open/close door & gate sensor. Fields: DOOR_OPEN_STATUS, LAST_DOOR_OPEN_DURATION.'
) ON CONFLICT DO NOTHING;

-- RAK 7200 — GPS Tracker
INSERT INTO device_types (name, manufacturer, protocol, category, icon, description)
VALUES (
    'RAK 7200',
    'RAKwireless',
    'lorawan',
    'gps_tracker',
    '📍',
    'LoRaWAN GPS tracker with accelerometer. Fields: latitude, longitude, battery.'
) ON CONFLICT DO NOTHING;

-- Browan TBHH100 — Indoor Temp & Humidity
INSERT INTO device_types (name, manufacturer, protocol, category, icon, description)
VALUES (
    'Browan TBHH100',
    'Browan',
    'lorawan',
    'environment',
    '🌡️',
    'Indoor temperature & humidity sensor. Fields: TempC_SHT, Hum_SHT.'
) ON CONFLICT DO NOTHING;

-- Digitanimal GPS Ear Tag — Livestock Tracking
INSERT INTO device_types (name, manufacturer, protocol, category, icon, description)
VALUES (
    'Digitanimal GPS Ear Tag',
    'Digitanimal',
    'lorawan',
    'gps_tracker',
    '🐄',
    'Livestock ear tag with GPS & activity monitoring.'
) ON CONFLICT DO NOTHING;

-- Davis Vantage Pro2 — Weather Station
INSERT INTO device_types (name, manufacturer, protocol, category, icon, description)
VALUES (
    'Davis Vantage Pro2',
    'Davis Instruments',
    'wifi',
    'environment',
    '🌤️',
    'Weather station: wind, rain, temperature, humidity, solar radiation.'
) ON CONFLICT DO NOTHING;

-- Dragino LSN50v2-S31 — Outdoor Weather Sensor
INSERT INTO device_types (name, manufacturer, protocol, category, icon, description)
VALUES (
    'Dragino LSN50v2-S31',
    'Dragino',
    'lorawan',
    'environment',
    '🌦️',
    'LoRaWAN outdoor weather sensor with temperature & humidity.'
) ON CONFLICT DO NOTHING;

-- LoRa Trail Camera — Game/Trail Camera
INSERT INTO device_types (name, manufacturer, protocol, category, icon, description)
VALUES (
    'LoRa Trail Camera',
    'Generic',
    'lorawan',
    'other',
    '📷',
    'LoRa-connected trail/game camera reporting motion events.'
) ON CONFLICT DO NOTHING;

-- Generic TTN Device — Fallback
INSERT INTO device_types (name, manufacturer, protocol, category, icon, description)
VALUES (
    'Generic TTN Device',
    NULL,
    'lorawan',
    'other',
    '📦',
    'Fallback for unknown TTN-connected LoRaWAN devices.'
) ON CONFLICT DO NOTHING;
