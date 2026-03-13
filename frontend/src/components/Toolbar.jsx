import { useState, useEffect } from 'react'
import { POINT_TYPES } from '../constants/pointTypes'
import { T } from '../constants/theme'

const AREA_MODES = [
  { id: 'draw_property', label: 'Property', color: '#8FAF7A' },
  { id: 'draw_farm',     label: 'Farm',     color: '#D4B646' },
  { id: 'draw_camp',     label: 'Camp',     color: '#4C7A8C' },
]

function loadToolbarState() {
  try { return JSON.parse(localStorage.getItem('landman_toolbar')) ?? {} } catch { return {} }
}
function saveToolbarState(patch) {
  try {
    const cur = loadToolbarState()
    localStorage.setItem('landman_toolbar', JSON.stringify({ ...cur, ...patch }))
  } catch {}
}

export default function Toolbar({ mode, onModeChange, onObservationClick }) {
  const init       = loadToolbarState()
  const [open, setOpen]       = useState(init.open    ?? true)
  const [section, setSection] = useState(init.section ?? null)

  const isDrawing = mode !== 'view'
  const toggle    = (modeId) => onModeChange(mode === modeId ? 'view' : modeId)

  const setOpenSaved = (v) => { setOpen(v); saveToolbarState({ open: v }) }
  const toggleSection = (id) => {
    const next = section === id ? null : id
    setSection(next)
    saveToolbarState({ section: next })
  }

  // Auto-open the relevant section when a draw mode is active
  useEffect(() => {
    if (mode === 'view') return
    const isArea  = AREA_MODES.some((m) => m.id === mode)
    const isPoint = POINT_TYPES.some((pt) => pt.drawMode === mode)
    if (isArea  && section !== 'areas')  { setSection('areas');  saveToolbarState({ section: 'areas'  }) }
    if (isPoint && section !== 'points') { setSection('points'); saveToolbarState({ section: 'points' }) }
  }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) {
    return (
      <button style={s.pill} onClick={() => setOpenSaved(true)}>
        <span style={s.pillLogo}>LANDMAN</span>
        <span style={s.pillArrow}>▸</span>
      </button>
    )
  }

  return (
    <div style={s.panel}>
      {/* ── Header / collapse ── */}
      <button style={s.header} onClick={() => setOpenSaved(false)}>
        <span style={s.logo}>LANDMAN</span>
        <span style={s.headerArrow}>◂</span>
      </button>

      {/* ── AREAS accordion ── */}
      <Section label="AREAS" active={section === 'areas'} onToggle={() => toggleSection('areas')}>
        {AREA_MODES.map((m) => (
          <ItemBtn
            key={m.id}
            active={mode === m.id}
            color={m.color}
            onClick={() => toggle(m.id)}
          >
            <span style={{ ...s.dot, background: m.color }} />
            {m.label}
          </ItemBtn>
        ))}
      </Section>

      {/* ── POINTS accordion ── */}
      <Section label="POINTS" active={section === 'points'} onToggle={() => toggleSection('points')}>
        {POINT_TYPES.map((pt) => (
          <ItemBtn
            key={pt.drawMode}
            active={mode === pt.drawMode}
            color={pt.color}
            onClick={() => toggle(pt.drawMode)}
          >
            <span style={s.itemIcon}>{pt.icon}</span>
            {pt.label}
          </ItemBtn>
        ))}
      </Section>

      {/* ── OBSERVE accordion ── */}
      <Section label="OBSERVE" active={section === 'observe'} onToggle={() => toggleSection('observe')}>
        <ItemBtn onClick={onObservationClick}>
          <span style={s.itemIcon}>📷</span>
          Add Photos
        </ItemBtn>
      </Section>

      {/* ── Cancel while drawing ── */}
      {isDrawing && (
        <div style={s.cancelWrap}>
          <button style={s.cancelBtn} onClick={() => onModeChange('view')}>
            ✕ Cancel Drawing
          </button>
        </div>
      )}
    </div>
  )
}

/* ── Sub-components ─────────────────────────────────────────────── */

function Section({ label, active, onToggle, children }) {
  return (
    <div style={sec.wrap}>
      <button style={sec.header} onClick={onToggle}>
        <span style={sec.label}>{label}</span>
        <span style={sec.chevron}>{active ? '▾' : '▸'}</span>
      </button>
      {active && <div style={sec.body}>{children}</div>}
    </div>
  )
}

function ItemBtn({ active, color, onClick, children }) {
  const base = s.item
  const over = active && color
    ? { borderColor: color, color, background: `${color}1a` }
    : {}
  return (
    <button style={{ ...base, ...over }} onClick={onClick}>
      {children}
    </button>
  )
}

/* ── Styles ─────────────────────────────────────────────────────── */

const s = {
  pill: {
    position: 'absolute', top: 16, left: 16, zIndex: 10,
    display: 'flex', alignItems: 'center', gap: 6,
    background: T.surface, backdropFilter: 'blur(10px)',
    border: `1px solid ${T.surfaceBorder}`, borderRadius: 8,
    padding: '7px 12px', boxShadow: T.surfaceShadow, cursor: 'pointer',
  },
  pillLogo: {
    color: T.brand, fontFamily: "'Exo 2', sans-serif",
    fontWeight: 800, fontSize: 13, letterSpacing: '0.14em',
  },
  pillArrow: { color: T.textFaint, fontSize: 11 },
  panel: {
    position: 'absolute', top: 16, left: 16, zIndex: 10,
    background: T.surface, backdropFilter: 'blur(10px)',
    border: `1px solid ${T.surfaceBorder}`, borderRadius: 10,
    boxShadow: T.surfaceShadow, width: 192, overflow: 'hidden',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    width: '100%', background: 'transparent', border: 'none',
    borderBottom: `1px solid ${T.surfaceBorder}`, padding: '10px 14px', cursor: 'pointer',
  },
  logo: {
    color: T.brand, fontFamily: "'Exo 2', sans-serif",
    fontWeight: 800, fontSize: 13, letterSpacing: '0.14em',
  },
  headerArrow: { color: T.textFaint, fontSize: 11 },
  item: {
    display: 'flex', alignItems: 'center', gap: 8,
    width: '100%', background: 'transparent',
    border: `1px solid ${T.surfaceBorder}`, borderRadius: 6,
    color: T.textMuted, fontSize: 12, fontWeight: 500,
    padding: '6px 10px', cursor: 'pointer', textAlign: 'left',
    transition: 'all 0.15s', marginBottom: 4,
    fontFamily: 'inherit',
  },
  dot: { width: 7, height: 7, borderRadius: '50%', flexShrink: 0 },
  itemIcon: { fontSize: 13, lineHeight: 1, flexShrink: 0 },
  cancelWrap: { padding: '8px 12px', borderTop: `1px solid ${T.surfaceBorder}` },
  cancelBtn: {
    width: '100%', background: 'transparent',
    border: `1px solid ${T.dangerBorder}`, borderRadius: 6,
    color: T.danger, fontSize: 12, fontWeight: 500,
    padding: '6px 10px', cursor: 'pointer', fontFamily: 'inherit',
  },
}

const sec = {
  wrap: { borderBottom: `1px solid ${T.surfaceBorder}` },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    width: '100%', background: 'transparent', border: 'none',
    padding: '9px 14px', cursor: 'pointer',
  },
  label: {
    color: T.textFaint, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
  },
  chevron: { color: T.textFaint, fontSize: 11 },
  body: { padding: '4px 10px 8px' },
}
