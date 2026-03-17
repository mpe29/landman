import { useState } from 'react'
import { T, C } from '../constants/theme'
import { api } from '../api'

export default function PendingScreen({ onPropertyCreated }) {
  const [showCreate, setShowCreate] = useState(false)
  const [propertyName, setPropertyName] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleCreate = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.createProperty({ name: propertyName, owner: fullName })
      if (onPropertyCreated) onPropertyCreated()
    } catch (err) {
      setError(err.message || 'Failed to create property')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={s.container}>
      <div style={s.card}>
        <div style={s.logo}>LANDMAN</div>

        {!showCreate ? (
          <>
            <div style={s.icon}>&#9203;</div>
            <div style={s.title}>Welcome!</div>
            <div style={s.message}>
              Your account is ready. What would you like to do?
            </div>
            <button style={s.primaryBtn} onClick={() => setShowCreate(true)}>
              🏡 Create a New Property
            </button>
            <div style={s.orDivider}>
              <span style={s.orLine} />
              <span style={s.orText}>or</span>
              <span style={s.orLine} />
            </div>
            <div style={s.message}>
              If you were invited to an existing property, ask your property admin for an invite link.
            </div>
            <button style={s.btn} onClick={() => api.signOut()}>
              Sign Out
            </button>
          </>
        ) : (
          <>
            <div style={s.title}>Create Your Property</div>
            <div style={s.message}>
              Set up your property to start mapping boundaries, observations, and more.
            </div>
            <form onSubmit={handleCreate} style={s.form}>
              <input
                type="text"
                placeholder="Your Full Name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                style={s.input}
                required
                autoComplete="name"
                autoFocus
              />
              <input
                type="text"
                placeholder="Property / Farm Name"
                value={propertyName}
                onChange={(e) => setPropertyName(e.target.value)}
                style={s.input}
                required
              />
              {error && <div style={s.error}>{error}</div>}
              <button type="submit" style={s.primaryBtn} disabled={loading}>
                {loading ? 'Creating...' : 'Create Property'}
              </button>
              <button
                type="button"
                style={s.linkBtn}
                onClick={() => { setShowCreate(false); setError('') }}
              >
                Back
              </button>
            </form>
          </>
        )}
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
    width: '100%', maxWidth: 380, padding: '36px 28px',
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
    fontSize: 13, color: T.textMuted, lineHeight: 1.5, marginBottom: 16,
  },
  form: {
    width: '100%', display: 'flex', flexDirection: 'column', gap: 12,
  },
  input: {
    width: '100%', padding: '10px 14px',
    border: `1px solid ${T.surfaceBorder}`, borderRadius: 8,
    fontSize: 14, fontFamily: 'inherit', outline: 'none',
    background: '#fff', color: T.text,
    boxSizing: 'border-box',
  },
  primaryBtn: {
    width: '100%', padding: '11px 0',
    background: C.deepOlive, color: C.panelBg,
    border: 'none', borderRadius: 8, cursor: 'pointer',
    fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
  },
  btn: {
    padding: '10px 28px',
    background: 'transparent', color: T.textMuted,
    border: `1px solid ${T.surfaceBorder}`, borderRadius: 8,
    cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
  },
  linkBtn: {
    background: 'none', border: 'none',
    color: T.textMuted, fontSize: 12, cursor: 'pointer',
    fontFamily: 'inherit', textDecoration: 'underline',
    marginTop: 4,
  },
  orDivider: {
    display: 'flex', alignItems: 'center', gap: 12,
    width: '100%', margin: '8px 0',
  },
  orLine: {
    flex: 1, height: 1, background: T.surfaceBorder,
  },
  orText: {
    fontSize: 11, color: T.textMuted, textTransform: 'uppercase',
  },
  error: {
    padding: '8px 12px', borderRadius: 6,
    background: T.dangerBg, border: `1px solid ${T.dangerBorder}`,
    color: T.danger, fontSize: 12, textAlign: 'center',
  },
}
