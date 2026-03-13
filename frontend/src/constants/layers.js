// LANDMAN Layer Registry
//
// Single source of truth for every map layer.
// Map.jsx iterates this to create sources + Mapbox layers.
// LayerControl.jsx iterates this to render toggle UI.
//
// To add a new layer type in future:
//   1. Add one entry here
//   2. Ensure api.js has a getter that returns { id, name, geom/boundary, ... }
//   3. Map.jsx will pick it up automatically via the dataLoader function
//
// Layer types:
//   'polygon' — fill + outline pair, requires geometry type Polygon/MultiPolygon
//   'line'    — single line layer, requires geometry type LineString
//   'point'   — circle layer, requires geometry type Point
//   'symbol'  — text/icon label layer (special-cased in Map.jsx)
//
// For 'point' layers with per-feature colours, set color: 'multi' and
// provide a colorExpression (Mapbox match expression).

export const LAYER_GROUPS = [
  { id: 'areas',          label: 'Land Areas'    },
  { id: 'infrastructure', label: 'Infrastructure' },
  { id: 'field_data',     label: 'Field Data'    },  // future
  { id: 'operations',     label: 'Operations'    },  // future
]

export const LAYERS = [
  // ----------------------------------------------------------------
  // Land Areas
  // ----------------------------------------------------------------
  {
    id:             'properties',
    label:          'Property Boundary',
    group:          'areas',
    type:           'polygon',
    color:          '#8FAF7A',
    fillOpacity:    0.10,
    lineWidth:      2.5,
    featureType:    'property',      // passed to onFeatureClick
    defaultVisible: true,
    // dataLoader: filled by Map.jsx from api.getProperties()
  },
  {
    id:             'farms',
    label:          'Farms',
    group:          'areas',
    type:           'polygon',
    color:          '#D4B646',
    fillOpacity:    0.12,
    lineWidth:      1.8,
    featureType:    'area',
    defaultVisible: true,
  },
  {
    id:             'camps',
    label:          'Camps / Paddocks',
    group:          'areas',
    type:           'polygon',
    color:          '#4C7A8C',
    fillOpacity:    0.12,
    lineWidth:      1.2,
    featureType:    'area',
    defaultVisible: true,
  },

  // ----------------------------------------------------------------
  // Infrastructure — points
  // ----------------------------------------------------------------
  {
    id:             'point_assets',
    label:          'Infrastructure',
    group:          'infrastructure',
    type:           'point',
    color:          'multi',         // per-feature via colorExpression
    circleRadius:   7,
    featureType:    'point_asset',
    defaultVisible: true,
  },

  // ----------------------------------------------------------------
  // Infrastructure — lines (not yet drawn, config ready)
  // ----------------------------------------------------------------
  {
    id:             'fences',
    label:          'Fences',
    group:          'infrastructure',
    type:           'line',
    color:          '#f59e0b',
    lineWidth:      1.5,
    featureType:    'linear_asset',
    defaultVisible: true,
    comingSoon:     true,            // hidden from LayerControl until implemented
  },
  {
    id:             'roads',
    label:          'Roads',
    group:          'infrastructure',
    type:           'line',
    color:          '#a8a29e',
    lineWidth:      1.5,
    featureType:    'linear_asset',
    defaultVisible: true,
    comingSoon:     true,
  },

  // ----------------------------------------------------------------
  // Field data
  // ----------------------------------------------------------------
  {
    id:             'observations',
    label:          'Observations',
    group:          'field_data',
    type:           'point',
    color:          '#C46A2D',
    circleRadius:   6,
    featureType:    'observation',
    defaultVisible: true,
  },
  {
    id:             'livestock_counts',
    label:          'Livestock Counts',
    group:          'field_data',
    type:           'symbol',
    featureType:    null,            // symbol layer — not clickable
    defaultVisible: true,
  },
]

// Convenience: default visibility map { layerId: bool }
export const DEFAULT_VISIBILITY = Object.fromEntries(
  LAYERS.map((l) => [l.id, l.defaultVisible])
)

// Active layers only (not comingSoon)
export const ACTIVE_LAYERS = LAYERS.filter((l) => !l.comingSoon)
