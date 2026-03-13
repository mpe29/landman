import { POINT_TYPES } from '../constants/pointTypes'

const AREA_MODES = [
  { id: 'draw_property', label: 'Property', color: '#4ade80' },
  { id: 'draw_farm',     label: 'Farm',     color: '#fbbf24' },
  { id: 'draw_camp',     label: 'Camp',     color: '#60a5fa' },
]

export default function Toolbar({ mode, onModeChange }) {
  const isDrawing = mode !== 'view'

  const toggle = (modeId) => onModeChange(mode === modeId ? 'view' : modeId)

  return (
    <div style={styles.toolbar}>
      {/* Logo */}
      <span style={styles.logo}>LANDMAN</span>
      <div style={styles.divider} />

      {/* Area section */}
      <span style={styles.groupLabel}>AREAS</span>
      {AREA_MODES.map((m) => (
        <button
          key={m.id}
          onClick={() => toggle(m.id)}
          style={mode === m.id
            ? { ...styles.btn, borderColor: m.color, color: m.color, background: `${m.color}18` }
            : styles.btn}
          title={`Draw ${m.label}`}
        >
          <span style={{ ...styles.dot, background: m.color }} />
          {m.label}
        </button>
      ))}

      <div style={styles.divider} />

      {/* Point assets section */}
      <span style={styles.groupLabel}>POINTS</span>
      {POINT_TYPES.slice(0, 4).map((pt) => (
        <button
          key={pt.drawMode}
          onClick={() => toggle(pt.drawMode)}
          style={mode === pt.drawMode
            ? { ...styles.btn, ...styles.iconBtn, borderColor: pt.color, color: pt.color, background: `${pt.color}18` }
            : { ...styles.btn, ...styles.iconBtn }}
          title={pt.label}
        >
          <span style={styles.ptIcon}>{pt.icon}</span>
          <span>{pt.label}</span>
        </button>
      ))}

      {/* Cancel button when drawing */}
      {isDrawing && (
        <>
          <div style={styles.divider} />
          <button style={styles.cancelBtn} onClick={() => onModeChange('view')} title="Cancel draw">
            ✕ Cancel
          </button>
        </>
      )}
    </div>
  )
}

const styles = {
  toolbar: {
    position: 'absolute',
    top: 16,
    left: 16,
    zIndex: 10,
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    background: 'rgba(15, 20, 25, 0.92)',
    backdropFilter: 'blur(10px)',
    borderRadius: 10,
    padding: '8px 14px',
    boxShadow: '0 2px 16px rgba(0,0,0,0.5)',
    border: '1px solid rgba(255,255,255,0.08)',
    maxWidth: 'calc(100vw - 120px)',
  },
  logo: {
    color: '#4ade80',
    fontWeight: 800,
    fontSize: 12,
    letterSpacing: '0.14em',
    flexShrink: 0,
  },
  divider: {
    width: 1,
    height: 18,
    background: 'rgba(255,255,255,0.1)',
    flexShrink: 0,
  },
  groupLabel: {
    color: 'rgba(255,255,255,0.28)',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.1em',
    flexShrink: 0,
  },
  btn: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 6,
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: 500,
    padding: '5px 9px',
    cursor: 'pointer',
    transition: 'all 0.15s',
    flexShrink: 0,
  },
  iconBtn: {
    padding: '5px 9px',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    flexShrink: 0,
  },
  ptIcon: {
    fontSize: 13,
    lineHeight: 1,
  },
  cancelBtn: {
    background: 'transparent',
    border: '1px solid rgba(255,100,100,0.35)',
    borderRadius: 6,
    color: 'rgba(255,130,130,0.8)',
    fontSize: 12,
    fontWeight: 500,
    padding: '5px 10px',
    cursor: 'pointer',
    flexShrink: 0,
  },
}
