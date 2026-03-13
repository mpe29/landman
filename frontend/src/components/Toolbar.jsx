import { POINT_TYPES } from '../constants/pointTypes'

const AREA_MODES = [
  { id: 'draw_property', label: 'Property', color: '#16a34a' },
  { id: 'draw_farm',     label: 'Farm',     color: '#d97706' },
  { id: 'draw_camp',     label: 'Camp',     color: '#2563eb' },
]

export default function Toolbar({ mode, onModeChange, onObservationClick }) {
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
            ? { ...styles.btn, borderColor: m.color, color: m.color, background: `${m.color}14` }
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
            ? { ...styles.btn, ...styles.iconBtn, borderColor: pt.color, color: pt.color, background: `${pt.color}14` }
            : { ...styles.btn, ...styles.iconBtn }}
          title={pt.label}
        >
          <span style={styles.ptIcon}>{pt.icon}</span>
          <span>{pt.label}</span>
        </button>
      ))}

      <div style={styles.divider} />

      {/* Observations section */}
      <span style={styles.groupLabel}>OBSERVE</span>
      <button
        style={{ ...styles.btn, ...styles.iconBtn }}
        onClick={onObservationClick}
        title="Add photo observation"
      >
        <span style={styles.ptIcon}>📷</span>
        <span>Add Photo</span>
      </button>

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
    background: 'rgba(255, 255, 255, 0.97)',
    backdropFilter: 'blur(10px)',
    borderRadius: 10,
    padding: '8px 14px',
    boxShadow: '0 2px 20px rgba(0,0,0,0.1)',
    border: '1px solid rgba(0,0,0,0.08)',
    maxWidth: 'calc(100vw - 120px)',
  },
  logo: {
    color: '#16a34a',
    fontFamily: "'Exo 2', sans-serif",
    fontWeight: 800,
    fontSize: 13,
    letterSpacing: '0.14em',
    flexShrink: 0,
  },
  divider: {
    width: 1,
    height: 18,
    background: 'rgba(0,0,0,0.08)',
    flexShrink: 0,
  },
  groupLabel: {
    color: 'rgba(0,0,0,0.3)',
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
    border: '1px solid rgba(0,0,0,0.1)',
    borderRadius: 6,
    color: 'rgba(0,0,0,0.6)',
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
    border: '1px solid rgba(220,38,38,0.3)',
    borderRadius: 6,
    color: 'rgba(220,38,38,0.75)',
    fontSize: 12,
    fontWeight: 500,
    padding: '5px 10px',
    cursor: 'pointer',
    flexShrink: 0,
  },
}
