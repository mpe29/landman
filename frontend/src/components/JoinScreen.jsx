import { useState, useEffect, useRef } from 'react'
import { T, C } from '../constants/theme'
import { api } from '../api'

export default function JoinScreen({ token }) {
  const [resolving, setResolving] = useState(true)
  const [joinInfo, setJoinInfo] = useState(null) // { email, userName, propertyName }
  const [pin, setPin] = useState(['', '', '', ''])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRefs = [useRef(), useRef(), useRef(), useRef()]

  useEffect(() => {
    api.resolveJoinToken(token)
      .then((info) => { setJoinInfo(info); setResolving(false) })
      .catch((err) => { setError(err.message); setResolving(false) })
  }, [token])

  const handleDigit = (index, value) => {
    if (!/^\d?$/.test(value)) return
    const next = [...pin]
    next[index] = value
    setPin(next)
    setError('')

    // Auto-advance to next input
    if (value && index < 3) {
      inputRefs[index + 1].current?.focus()
    }

    // Auto-submit when all 4 digits entered
    if (value && index === 3 && next.every((d) => d)) {
      submitPin(next.join(''))
    }
  }

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      inputRefs[index - 1].current?.focus()
    }
  }

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData('text').trim()
    if (/^\d{4}$/.test(pasted)) {
      e.preventDefault()
      const digits = pasted.split('')
      setPin(digits)
      inputRefs[3].current?.focus()
      submitPin(pasted)
    }
  }

  const submitPin = async (pinStr) => {
    if (!joinInfo) return
    setLoading(true)
    setError('')
    try {
      await api.signIn({ email: joinInfo.email, password: pinStr })
    } catch {
      setError('Wrong PIN. Try again.')
      setPin(['', '', '', ''])
      setLoading(false)
      inputRefs[0].current?.focus()
    }
  }

  if (resolving) {
    return (
      <div style={s.container}>
        <div style={s.card}>
          <div style={s.logo}>LANDMAN</div>
          <div style={s.subtitle}>Loading...</div>
        </div>
      </div>
    )
  }

  if (!joinInfo) {
    return (
      <div style={s.container}>
        <div style={s.card}>
          <div style={s.logo}>LANDMAN</div>
          <div style={s.error}>{error || 'This link is invalid or has expired.'}</div>
        </div>
      </div>
    )
  }

  return (
    <div style={s.container}>
      <div style={s.card}>
        <div style={s.logo}>LANDMAN</div>
        <div style={s.greeting}>Hi {joinInfo.userName}</div>
        <div style={s.subtitle}>
          Enter your PIN to access <strong>{joinInfo.propertyName}</strong>
        </div>

        <div style={s.pinRow} onPaste={handlePaste}>
          {pin.map((digit, i) => (
            <input
              key={i}
              ref={inputRefs[i]}
              type="tel"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleDigit(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              style={s.pinInput}
              autoFocus={i === 0}
              disabled={loading}
            />
          ))}
        </div>

        {error && <div style={s.error}>{error}</div>}
        {loading && <div style={s.subtitle}>Signing in...</div>}
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
    width: '100%', maxWidth: 340, padding: '36px 28px',
    background: C.panelBg, borderRadius: 14,
    boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
  },
  logo: {
    fontFamily: "'Exo 2', sans-serif", fontWeight: 800,
    fontSize: 28, letterSpacing: '0.14em', color: C.deepOlive,
    marginBottom: 8,
  },
  greeting: {
    fontSize: 18, fontWeight: 600, color: C.deepOlive, marginBottom: 4,
  },
  subtitle: {
    fontSize: 13, color: T.textMuted, marginBottom: 24, textAlign: 'center',
  },
  pinRow: {
    display: 'flex', gap: 12, marginBottom: 16,
  },
  pinInput: {
    width: 56, height: 64,
    textAlign: 'center', fontSize: 28, fontWeight: 700,
    border: `2px solid ${T.surfaceBorder}`, borderRadius: 12,
    outline: 'none', fontFamily: 'inherit', color: T.text,
    background: '#fff',
  },
  error: {
    padding: '8px 16px', borderRadius: 6,
    background: T.dangerBg, border: `1px solid ${T.dangerBorder}`,
    color: T.danger, fontSize: 12, textAlign: 'center',
  },
}
