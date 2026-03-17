import { T, C } from '../constants/theme'
import { api } from '../api'

export default function PendingScreen() {
  return (
    <div style={s.container}>
      <div style={s.card}>
        <div style={s.logo}>LANDMAN</div>
        <div style={s.icon}>&#9203;</div>
        <div style={s.title}>Access Pending</div>
        <div style={s.message}>
          Your account has been created but you don't have access to any properties yet.
          Ask your property admin for an invite link.
        </div>
        <button style={s.btn} onClick={() => api.signOut()}>
          Sign Out
        </button>
      </div>
    </div>
  )
}

const s = {
  container: {
    position: 'fixed', inset: 0, zIndex: 9999,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: `linear-gradient(135deg, ${C.deepOlive} 0%, ${C.pistachioGreen} 100%)`,
    fontFamily: 'inherit',
  },
  card: {
    width: '100%', maxWidth: 360, padding: '36px 28px',
    background: C.panelBg, borderRadius: 14,
    boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    textAlign: 'center',
  },
  logo: {
    fontFamily: "'Exo 2', sans-serif", fontWeight: 800,
    fontSize: 28, letterSpacing: '0.14em', color: C.deepOlive,
    marginBottom: 16,
  },
  icon: {
    fontSize: 36, marginBottom: 8,
  },
  title: {
    fontSize: 16, fontWeight: 600, color: C.deepOlive, marginBottom: 8,
  },
  message: {
    fontSize: 13, color: T.textMuted, lineHeight: 1.5, marginBottom: 24,
  },
  btn: {
    padding: '10px 28px',
    background: 'transparent', color: T.textMuted,
    border: `1px solid ${T.surfaceBorder}`, borderRadius: 8,
    cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
  },
}
