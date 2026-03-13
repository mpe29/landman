const MODES = [
  { id: 'view',            label: 'View',            icon: '👁' },
  { id: 'draw_property',   label: 'Add Property',    icon: '⬡' },
]

export default function Toolbar({ mode, onModeChange }) {
  return (
    <div style={styles.toolbar}>
      <div style={styles.logo}>LANDMAN</div>
      <div style={styles.buttons}>
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => onModeChange(m.id === mode ? 'view' : m.id)}
            style={{
              ...styles.btn,
              ...(mode === m.id ? styles.btnActive : {}),
            }}
            title={m.label}
          >
            <span style={styles.icon}>{m.icon}</span>
            <span style={styles.label}>{m.label}</span>
          </button>
        ))}
      </div>
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
    gap: 12,
    background: 'rgba(15, 20, 25, 0.88)',
    backdropFilter: 'blur(8px)',
    borderRadius: 10,
    padding: '8px 14px',
    boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
    border: '1px solid rgba(255,255,255,0.08)',
  },
  logo: {
    color: '#4ade80',
    fontWeight: 700,
    fontSize: 13,
    letterSpacing: '0.12em',
    paddingRight: 10,
    borderRight: '1px solid rgba(255,255,255,0.12)',
  },
  buttons: {
    display: 'flex',
    gap: 6,
  },
  btn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 6,
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    padding: '5px 10px',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  btnActive: {
    background: 'rgba(74, 222, 128, 0.15)',
    borderColor: '#4ade80',
    color: '#4ade80',
  },
  icon: { fontSize: 14 },
  label: { fontWeight: 500 },
}
