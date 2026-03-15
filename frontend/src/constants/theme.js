// LANDMAN Design Tokens
// Source: landman_palette_v2.png
//
// Usage:
//   import { C, T } from '../constants/theme'
//   style={{ color: T.text, background: T.surface }}

// ── Raw palette ────────────────────────────────────────────────────
export const C = {
  pistachioGreen: '#8FAF7A',  // Primary brand / property boundaries
  deepOlive:      '#4E5B3C',  // Headers, menus, structural UI
  khakiPaper:     '#C6BFA6',  // Dividers, subtle borders
  burntOrange:    '#C46A2D',  // Alerts, actions, observations, infrastructure
  dustyBlue:      '#4C7A8C',  // Camps, water layers, data overlays
  dryGrassYellow: '#D4B646',  // Farms, selected boundaries, highlights
  charcoal:       '#2F2F2F',  // Primary text
  panelBg:        '#F3F1E8',  // Panels and cards
}

// ── Shared panel shell styles ──────────────────────────────────────
// Import these in every bottom-left panel component so they stay in sync.
// See docs/UI_PATTERNS.md for the full usage pattern.
export const PANEL_SHELL = {
  background:    C.panelBg,
  backdropFilter: 'blur(10px)',
  border:        `1px solid rgba(78,91,60,0.14)`,
  borderRadius:  10,
  boxShadow:     '0 2px 20px rgba(47,47,47,0.10)',
  overflow:      'hidden',
}

export const PANEL_HEADER = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  width: '100%', background: 'transparent', border: 'none',
  padding: '9px 14px', cursor: 'pointer',
}

export const PANEL_TITLE   = { color: 'rgba(47,47,47,0.32)', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em' }
export const PANEL_CHEVRON = { color: 'rgba(47,47,47,0.32)', fontSize: 11 }

// ── Semantic UI tokens ─────────────────────────────────────────────
export const T = {
  // Surfaces
  surface:       C.panelBg,
  surfaceBorder: 'rgba(78,91,60,0.14)',    // deepOlive @ ~14%
  surfaceShadow: '0 2px 20px rgba(47,47,47,0.10)',

  // Text
  text:      C.charcoal,
  textMuted: 'rgba(47,47,47,0.50)',
  textFaint: 'rgba(47,47,47,0.32)',
  textOnDark: C.panelBg,

  // Brand / interactive
  brand:        C.deepOlive,
  brandBg:      C.deepOlive + '18',  // deepOlive @ ~9% opacity
  brandBorder:  C.deepOlive + '45',  // deepOlive @ ~27% opacity
  accent:       C.pistachioGreen,
  accentBg:     C.pistachioGreen + '1a',

  // Layer / map semantic colours
  mapProperty: C.pistachioGreen,
  mapFarm:     C.dustyBlue,
  mapCamp:     C.dryGrassYellow,
  mapObs:      C.burntOrange,
  mapInfra:    C.burntOrange,

  // Danger
  danger:       '#b91c1c',
  dangerBg:     'rgba(185,28,28,0.07)',
  dangerBorder: 'rgba(185,28,28,0.28)',

  // Warning (amber — uses dryGrassYellow)
  warn:       '#92400e',
  warnBg:     C.dryGrassYellow + '14',
  warnBorder: C.dryGrassYellow + '40',
}
