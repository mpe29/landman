const MODES = [
  { id: 'view',          label: 'View',        icon: '👁',  color: null },
  { id: 'draw_property', label: 'Property',    icon: '⬡',  color: '#4ade80' },
  { id: 'draw_farm',     label: 'Farm',        icon: '◼',  color: '#fbbf24' },
  { id: 'draw_camp',     label: 'Camp',        icon: '◻',  color: '#60a5fa' },
]

export default function Toolbar({ mode, onModeChange }) {
  return (
    <div style={styles.toolbar}>
      <div style={styles.logo}>LANDMAN</div>
      <div style={styles.divider} />
      <span style={styles.addLabel}>ADD</span>
      <div style={styles.buttons}>
        {MODES.filter((m) => m.id !== 'view').map((m) => (
          <button
            key={m.id}
            onClick={() => onModeChange(mode === m.id ? 'view' : m.id)}
            style={{
              ...styles.btn,
              ...(mode === m.id
                ? { ...styles.btnActive, borderColor: m.color, color: m.color, background: `${m.color}18` }
                : {}),
            }}
            title={m.label}
          >
            <span style={{ ...styles.dot, background: m.color }} />
            {m.label}
          </button>
        ))}
      </div>
      {mode !== 'view' && (
        <button style={styles.cancelBtn} onClick={() => onModeChange('view')} title="Cancel">
          ✕
        </button>
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
    gap: 10,
    background: 'rgba(15, 20, 25, 0.90)',
    backdropFilter: 'blur(10px)',
    borderRadius: 10,
    padding: '8px 14px',
    boxShadow: '0 2px 16px rgba(0,0,0,0.5)',
    border: '1px solid rgba(255,255,255,0.08)',
  },
  logo: {
    color: '#4ade80',
    fontWeight: 800,
    fontSize: 12,
    letterSpacing: '0.14em',
  },
  divider: {
    width: 1,
    height: 18,
    background: 'rgba(255,255,255,0.1)',
  },
  addLabel: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.1em',
  },
  buttons: {
    display: 'flex',
    gap: 5,
  },
  btn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 6,
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: 500,
    padding: '5px 10px',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  btnActive: {},
  dot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
  cancelBtn: {
    background: 'transparent',
    border: '1px solid rgba(255,100,100,0.3)',
    borderRadius: 6,
    color: 'rgba(255,100,100,0.7)',
    fontSize: 12,
    padding: '5px 9px',
    cursor: 'pointer',
    marginLeft: 2,
  },
}
