-- LANDMAN Livestock Migration
-- Run in Supabase SQL Editor.
-- Creates: livestock_types, breeds, livestock, eid_tags, livestock_events tables
-- Creates: livestock_alive_counts, livestock_camp_counts views
-- Updates: areas_geo view to include livestock_count
-- Creates: create_livestock, create_livestock_event RPC functions

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS livestock_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  common_name TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'domestic', -- domestic | game | other
  lsu_value   DECIMAL(4,2),                     -- Livestock Unit equivalent
  emoji       TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS breeds (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  livestock_type_id UUID NOT NULL REFERENCES livestock_types(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  origin_region     TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(livestock_type_id, name)
);

CREATE TABLE IF NOT EXISTS livestock (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id       UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  camp_id           UUID REFERENCES areas(id) ON DELETE SET NULL,
  livestock_type_id UUID NOT NULL REFERENCES livestock_types(id),
  breed_id          UUID REFERENCES breeds(id) ON DELETE SET NULL,
  is_group          BOOLEAN NOT NULL DEFAULT true,
  head_count        INTEGER NOT NULL DEFAULT 1,
  status            TEXT NOT NULL DEFAULT 'alive', -- alive | slaughtered | lost | died | poached | sold
  status_date       DATE,
  -- Individual animal fields (null for groups)
  sex               TEXT,  -- bull | cow | heifer | steer | calf | ram | ewe | lamb | wether
  dob               DATE,
  tag_number        TEXT,
  acquired_at       DATE,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS eid_tags (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  eid          TEXT NOT NULL UNIQUE,
  livestock_id UUID REFERENCES livestock(id) ON DELETE SET NULL,
  issued_at    DATE,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS livestock_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  livestock_id UUID NOT NULL REFERENCES livestock(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL, -- slaughter | death | lost | poached | sold | moved
  event_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  head_count   INTEGER NOT NULL DEFAULT 1,
  camp_from    UUID REFERENCES areas(id) ON DELETE SET NULL,
  camp_to      UUID REFERENCES areas(id) ON DELETE SET NULL,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SEED DATA — livestock_types
-- ============================================================

INSERT INTO livestock_types (name, common_name, category, lsu_value, emoji) VALUES
  ('cattle',      'Cattle',           'domestic', 1.00, '🐄'),
  ('sheep',       'Sheep',            'domestic', 0.10, '🐑'),
  ('goat',        'Goat',             'domestic', 0.17, '🐐'),
  ('horse',       'Horse',            'domestic', 1.25, '🐎'),
  ('donkey',      'Donkey',           'domestic', 0.70, '🫏'),
  ('pig',         'Pig',              'domestic', 0.30, '🐷'),
  ('eland',       'Eland',            'game',     0.90, '🦌'),
  ('kudu',        'Kudu',             'game',     0.35, '🦌'),
  ('wildebeest',  'Wildebeest',       'game',     0.50, '🐃'),
  ('zebra',       'Zebra',            'game',     0.80, '🦓'),
  ('gemsbok',     'Gemsbok / Oryx',   'game',     0.40, '🦌'),
  ('ostrich',     'Ostrich',          'game',     0.10, '🐦'),
  ('buffalo',     'Cape Buffalo',     'game',     1.00, '🐃')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- SEED DATA — breeds
-- ============================================================

INSERT INTO breeds (livestock_type_id, name, origin_region) VALUES
  -- Cattle
  ((SELECT id FROM livestock_types WHERE name = 'cattle'), 'Bonsmara',     'South Africa'),
  ((SELECT id FROM livestock_types WHERE name = 'cattle'), 'Nguni',        'South Africa'),
  ((SELECT id FROM livestock_types WHERE name = 'cattle'), 'Afrikaner',    'South Africa'),
  ((SELECT id FROM livestock_types WHERE name = 'cattle'), 'Brahman',      'USA / India'),
  ((SELECT id FROM livestock_types WHERE name = 'cattle'), 'Angus',        'Scotland'),
  ((SELECT id FROM livestock_types WHERE name = 'cattle'), 'Hereford',     'England'),
  ((SELECT id FROM livestock_types WHERE name = 'cattle'), 'Simmentaler',  'Switzerland'),
  ((SELECT id FROM livestock_types WHERE name = 'cattle'), 'Charolais',    'France'),
  ((SELECT id FROM livestock_types WHERE name = 'cattle'), 'Limousin',     'France'),
  ((SELECT id FROM livestock_types WHERE name = 'cattle'), 'Simbra',       'South Africa'),
  -- Sheep
  ((SELECT id FROM livestock_types WHERE name = 'sheep'), 'Merino',        'Spain / Australia'),
  ((SELECT id FROM livestock_types WHERE name = 'sheep'), 'Dorper',        'South Africa'),
  ((SELECT id FROM livestock_types WHERE name = 'sheep'), 'Damara',        'Namibia'),
  ((SELECT id FROM livestock_types WHERE name = 'sheep'), 'Karakul',       'Central Asia'),
  ((SELECT id FROM livestock_types WHERE name = 'sheep'), 'SA Mutton Merino', 'South Africa'),
  -- Goat
  ((SELECT id FROM livestock_types WHERE name = 'goat'), 'Boer Goat',     'South Africa'),
  ((SELECT id FROM livestock_types WHERE name = 'goat'), 'Kalahari Red',  'South Africa'),
  ((SELECT id FROM livestock_types WHERE name = 'goat'), 'Angora',        'Turkey'),
  ((SELECT id FROM livestock_types WHERE name = 'goat'), 'Savanna',       'South Africa')
ON CONFLICT (livestock_type_id, name) DO NOTHING;

-- ============================================================
-- VIEWS
-- ============================================================

-- Alive count per livestock record (head_count minus recorded losses)
DROP VIEW IF EXISTS livestock_alive_counts CASCADE;
CREATE VIEW livestock_alive_counts AS
SELECT
  l.*,
  lt.common_name,
  lt.emoji,
  lt.lsu_value,
  lt.category,
  b.name AS breed_name,
  l.head_count - COALESCE((
    SELECT SUM(le.head_count)
    FROM livestock_events le
    WHERE le.livestock_id = l.id
      AND le.event_type IN ('slaughter','death','lost','poached','sold','moved')
  ), 0) AS alive_count
FROM livestock l
JOIN livestock_types lt ON lt.id = l.livestock_type_id
LEFT JOIN breeds b ON b.id = l.breed_id;

-- Camp centroid points with species label — source for map symbol layer
DROP VIEW IF EXISTS livestock_camp_counts CASCADE;
CREATE VIEW livestock_camp_counts AS
SELECT
  a.id            AS camp_id,
  a.property_id,
  a.name          AS camp_name,
  ST_AsGeoJSON(ST_Centroid(a.boundary))::json AS geom,
  SUM(lac.alive_count)                         AS total_head,
  STRING_AGG(
    lac.emoji || ' ' || lac.alive_count::text,
    '  '
    ORDER BY lac.emoji
  ) AS label
FROM areas a
JOIN livestock_alive_counts lac ON lac.camp_id = a.id
WHERE a.level IN ('camp', 'paddock')
  AND lac.alive_count > 0
GROUP BY a.id, a.property_id, a.boundary, a.name;

-- Rebuild areas_geo to include livestock_count
DROP VIEW IF EXISTS areas_geo CASCADE;
CREATE VIEW areas_geo AS
SELECT
  a.id,
  a.property_id,
  a.parent_id,
  a.level,
  a.name,
  a.type,
  a.notes,
  a.area_ha,
  a.created_at,
  COALESCE((
    SELECT SUM(lac.alive_count)
    FROM livestock_alive_counts lac
    WHERE lac.camp_id = a.id
  ), 0) AS livestock_count,
  CASE WHEN a.boundary IS NOT NULL
    THEN ST_AsGeoJSON(a.boundary)::json
    ELSE NULL
  END AS boundary
FROM areas a;

-- ============================================================
-- RPC FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION create_livestock(
  p_property_id       UUID,
  p_camp_id           UUID    DEFAULT NULL,
  p_livestock_type_id UUID    DEFAULT NULL,
  p_breed_id          UUID    DEFAULT NULL,
  p_is_group          BOOLEAN DEFAULT TRUE,
  p_head_count        INTEGER DEFAULT 1,
  p_sex               TEXT    DEFAULT NULL,
  p_dob               DATE    DEFAULT NULL,
  p_tag_number        TEXT    DEFAULT NULL,
  p_acquired_at       DATE    DEFAULT NULL,
  p_notes             TEXT    DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO livestock (
    property_id, camp_id, livestock_type_id, breed_id,
    is_group, head_count, sex, dob, tag_number, acquired_at, notes
  ) VALUES (
    p_property_id, p_camp_id, p_livestock_type_id, p_breed_id,
    p_is_group, p_head_count, p_sex, p_dob, p_tag_number, p_acquired_at, p_notes
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION create_livestock_event(
  p_livestock_id UUID,
  p_event_type   TEXT,
  p_event_date   DATE    DEFAULT CURRENT_DATE,
  p_head_count   INTEGER DEFAULT 1,
  p_camp_from    UUID    DEFAULT NULL,
  p_camp_to      UUID    DEFAULT NULL,
  p_notes        TEXT    DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO livestock_events (
    livestock_id, event_type, event_date, head_count, camp_from, camp_to, notes
  ) VALUES (
    p_livestock_id, p_event_type, p_event_date, p_head_count, p_camp_from, p_camp_to, p_notes
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql;
