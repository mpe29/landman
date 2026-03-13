// Point asset type definitions used by Toolbar, DrawPointModal, and Map rendering.
// color: used for map circle fill and UI accents
// drawMode: the toolbar mode string that activates this type

export const POINT_TYPES = [
  { id: 'borehole',   label: 'Borehole',    icon: '💧', color: '#22d3ee', drawMode: 'draw_borehole'   },
  { id: 'kraal',      label: 'Kraal',       icon: '🐄', color: '#f97316', drawMode: 'draw_kraal'      },
  { id: 'campsite',   label: 'Campsite',    icon: '⛺', color: '#eab308', drawMode: 'draw_campsite'   },
  { id: 'lodge',      label: 'Lodge',       icon: '🏠', color: '#a855f7', drawMode: 'draw_lodge'      },
  { id: 'gate',       label: 'Gate',        icon: '🚧', color: '#94a3b8', drawMode: 'draw_gate'       },
  { id: 'dam',        label: 'Dam',         icon: '💦', color: '#3b82f6', drawMode: 'draw_dam'        },
  { id: 'water_tank', label: 'Water Tank',  icon: '🛢', color: '#06b6d4', drawMode: 'draw_water_tank' },
  { id: 'other',      label: 'Other',       icon: '📍', color: '#6b7280', drawMode: 'draw_other'      },
]

// All draw modes that place a point (not a polygon)
export const POINT_DRAW_MODES = new Set(POINT_TYPES.map((t) => t.drawMode))

// Look up a POINT_TYPE by its drawMode string
export const pointTypeFromMode = (mode) =>
  POINT_TYPES.find((t) => t.drawMode === mode) ?? null
