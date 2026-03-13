import { useState, useEffect } from 'react'
import { POINT_TYPES } from '../constants/pointTypes'
import { T } from '../constants/theme'

const AREA_MODES = [
  { id: 'draw_property', label: 'Property', color: '#8FAF7A' },
  { id: 'draw_farm',     label: 'Farm',     color: '#D4B646' },
  { id: 'draw_camp',     label: 'Camp',     color: '#4C7A8C' },
]

function loadSection() {
  try { return JSON.parse(localStorage.getItem('landman_toolbar'))?.section ?? null } catch { return null }
}
function saveSection(val) {
  try {
    const cur = JSON.parse(localStorage.getItem('landman_toolbar')) ?? {}
    localStorage.setItem('landman_toolbar', JSON.stringify({ ...cur, section: val }))
  } catch {}
}

export default function Toolbar({ mode, onModeChange, isOpen, onOpen }) {
  const [section, setSection] = useState(loadSection)

  const isDrawing = mode !== 'view'
  const toggle    = (modeId) => onModeChange(mode === modeId ? 'view' : modeId)

  const toggleSection = (id) => {
    const next = section === id ? null : id
    setSection(next)
    saveSection(next)
  }

  // Auto-open CREATE panel and the relevant section when a draw mode becomes active
  useEffect(() => {
    if (mode === 'view') return
    const isArea  = AREA_MODES.some((m) => m.id === mode)
    const isPoint = POINT_TYPES.some((pt) => pt.drawMode === mode)
    if (isArea  && section !== 'areas')  { setSection('areas');  saveSection('areas')  }
    if (isPoint && section !== 'points') { setSection('points'); saveSection('points') }
    if (!isOpen) onOpen()
  }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={s.panel}>
      <button style={s.header} onClick={onOpen}>
        <span style={s.title}>CREATE</span>
        <span style={s.chevron}>{isOpen ? '▾' : '▸'}</span>
      </button>

      {isOpen && (
        <div>
          {/* ── AREAS ── */}
          <Section label="AREAS" active={section === 'areas'} onToggle={() => toggleSection('areas')}>
            {AREA_MODES.map((m) => (
              <ItemBtn key={m.id} active={mode === m.id} color={m.color} onClick={() => toggle(m.id)}>
                <span style={{ ...s.dot, background: m.color }} />
                {m.label}
              </ItemBtn>
            ))}
          </Section>

          {/* ── POINTS ── */}
          <Section label="POINTS" active={section === 'points'} onToggle={() => toggleSection('points')}>
            {POINT_TYPES.map((pt) => (
              <ItemBtn key={pt.drawMode} active={mode === pt.drawMode} color={pt.color} onClick={() => toggle(pt.drawMode)}>
                <span style={s.itemIcon}>{pt.icon}</span>
                {pt.label}
              </ItemBtn>
            ))}
          </Section>

          {/* ── Cancel drawing ── */}
          {isDrawing && (
            <div style={s.cancelWrap}>
              <button style={s.cancelBtn} onClick={() => onModeChange('view')}>
                ✕ Cancel Drawing
              </button>
            </div>
          )}
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
  const over = active && color ? { borderColor: color, color, background: `${color}1a` } : {}
  return (
    <button style={{ ...s.item, ...over }} onClick={onClick}>
      {children}
    </button>
  )
}

/* ── Styles ─────────────────────────────────────────────────────── */

const s = {
  panel: {
    background: T.surface,
    backdropFilter: 'blur(10px)',
    border: `1px solid ${T.surfaceBorder}`,
    borderRadius: 10,
    boxShadow: T.surfaceShadow,
    overflow: 'hidden',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    width: '100%', background: 'transparent', border: 'none',
    padding: '9px 14px', cursor: 'pointer',
  },
  title: {
    color: T.textFaint, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
  },
  chevron: { color: T.textFaint, fontSize: 11 },
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
  wrap: { borderTop: `1px solid ${T.surfaceBorder}` },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    width: '100%', background: 'transparent', border: 'none',
    padding: '9px 14px', cursor: 'pointer',
  },
  label: { color: T.textFaint, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em' },
  chevron: { color: T.textFaint, fontSize: 11 },
  body: { padding: '4px 10px 8px' },
}
