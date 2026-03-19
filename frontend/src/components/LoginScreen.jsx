import { useState, useRef } from 'react'
import { T, C } from '../constants/theme'
import { api } from '../api'

export default function LoginScreen() {
  const [mode, setMode] = useState('signin') // 'signin' | 'signup' | 'pin_name' | 'pin_enter'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [fullName, setFullName] = useState('')
  const [propertyName, setPropertyName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [signupSuccess, setSignupSuccess] = useState(false)

  // PIN flow state
  const [pinName, setPinName] = useState('')
  const [pinInfo, setPinInfo] = useState(null) // { email, userName, propertyName }
  const [pin, setPin] = useState(['', '', '', ''])
  const inputRefs = [useRef(), useRef(), useRef(), useRef()]

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (mode === 'signin') {
        await api.signIn({ email, password })
      } else if (password !== confirmPassword) {
        setError('Passwords do not match')
        setLoading(false)
        return
      } else {
        const { session } = await api.signUp({ email, password, fullName })
        if (session) {
          await api.createProperty({ name: propertyName, owner: fullName })
        } else {
          // Email confirmation required — stash property info so we can
          // create it after the user confirms and signs in.
          try { localStorage.setItem('landman_pending_property', JSON.stringify({ name: propertyName, owner: fullName, email })) } catch {}
          setSignupSuccess(true)
        }
      }
    } catch (err) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const handlePinNameSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const info = await api.lookupPinUser(pinName)
      setPinInfo(info)
      setMode('pin_enter')
      setTimeout(() => inputRefs[0].current?.focus(), 100)
    } catch (err) {
      setError(err.message || 'Name not found')
    } finally {
      setLoading(false)
    }
  }

  const handleDigit = (index, value) => {
    if (!/^\d?$/.test(value)) return
    const next = [...pin]
    next[index] = value
    setPin(next)
    setError('')
    if (value && index < 3) inputRefs[index + 1].current?.focus()
    if (value && index === 3 && next.every((d) => d)) submitPin(next.join(''))
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
    if (!pinInfo) return
    setLoading(true)
    setError('')
    try {
      await api.signIn({ email: pinInfo.email, password: pinStr })
    } catch {
      setError('Wrong PIN. Try again.')
      setPin(['', '', '', ''])
      setLoading(false)
      inputRefs[0].current?.focus()
    }
  }

  if (signupSuccess) {
    return (
      <div style={s.container}>
        <div style={s.card}>
          <div style={s.logo}>LANDMAN</div>
          <div style={s.tagline}>Land Management Platform</div>
          <div style={s.successBox}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.deepOlive }}>Check your email</div>
            <div style={{ fontSize: 13, color: T.textMuted, marginTop: 6 }}>
              We sent a confirmation link to <strong>{email}</strong>.
              Click the link to activate your account.
            </div>
          </div>
          <button
            style={s.linkBtn}
            onClick={() => { setSignupSuccess(false); setMode('signin') }}
          >
            Back to Sign In
          </button>
        </div>
      </div>
    )
  }

  // PIN: enter name
  if (mode === 'pin_name') {
    return (
      <div style={s.container}>
        <div style={s.card}>
          <div style={s.logo}>LANDMAN</div>
          <div style={s.tagline}>Land Management Platform</div>
          <div style={s.subtitle}>Sign in with PIN</div>
          <form onSubmit={handlePinNameSubmit} style={s.form}>
            <input
              type="text"
              placeholder="Enter your full name"
              value={pinName}
              onChange={(e) => setPinName(e.target.value)}
              style={s.input}
              required
              autoFocus
              autoComplete="name"
            />
            {error && <div style={s.error}>{error}</div>}
            <button type="submit" style={s.btn} disabled={loading}>
              {loading ? 'Looking up...' : 'Continue'}
            </button>
          </form>
          <div style={s.linkRow}>
            <button
              style={s.linkBtn}
              onClick={() => { setMode('signin'); setError('') }}
            >
              Back to email sign in
            </button>
          </div>
        </div>
      </div>
    )
  }

  // PIN: enter digits
  if (mode === 'pin_enter') {
    return (
      <div style={s.container}>
        <div style={s.card}>
          <div style={s.logo}>LANDMAN</div>
          <div style={s.tagline}>Land Management Platform</div>
          <div style={s.greeting}>Hi {pinInfo?.userName}</div>
          <div style={s.subtitle}>
            Enter your PIN to access <strong>{pinInfo?.propertyName}</strong>
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
          <div style={s.linkRow}>
            <button
              style={s.linkBtn}
              onClick={() => { setMode('pin_name'); setError(''); setPin(['', '', '', '']); setPinInfo(null) }}
            >
              Back
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Standard sign in / sign up
  return (
    <div style={s.container}>
      <div style={s.card}>
        <div style={s.logo}>LANDMAN</div>
        <div style={s.tagline}>Land Management Platform</div>
        <div style={s.subtitle}>
          {mode === 'signin' ? 'Sign in to your account' : 'Create your property'}
        </div>

        <form onSubmit={handleSubmit} style={s.form}>
          {mode === 'signup' && (
            <>
              <input
                type="text"
                placeholder="Full Name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                style={s.input}
                required
                autoComplete="name"
              />
              <input
                type="text"
                placeholder="Property / Farm Name"
                value={propertyName}
                onChange={(e) => setPropertyName(e.target.value)}
                style={s.input}
                required
              />
            </>
          )}

          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={s.input}
            required
            autoComplete="email"
          />
          <div style={s.passwordWrap}>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={s.passwordInput}
              required
              minLength={6}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            />
            <button
              type="button"
              style={s.eyeBtn}
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? '🙈' : '👁'}
            </button>
          </div>

          {mode === 'signup' && (
            <div style={s.pwHint}>At least 6 characters</div>
          )}

          {mode === 'signup' && (
            <div style={s.passwordWrap}>
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Confirm Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                style={s.passwordInput}
                required
                minLength={6}
                autoComplete="new-password"
              />
              <button
                type="button"
                style={s.eyeBtn}
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                tabIndex={-1}
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
              >
                {showConfirmPassword ? '🙈' : '👁'}
              </button>
            </div>
          )}

          {error && <div style={s.error}>{error}</div>}

          <button type="submit" style={s.btn} disabled={loading}>
            {loading ? 'Please wait...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div style={s.linkRow}>
          <button
            style={s.linkBtn}
            onClick={() => { setMode('pin_name'); setError('') }}
          >
            Sign in with PIN
          </button>
          <button
            style={s.linkBtn}
            onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setConfirmPassword(''); setShowPassword(false); setShowConfirmPassword(false) }}
          >
            {mode === 'signin'
              ? "Don't have an account? Create Property"
              : 'Already have an account? Sign In'}
          </button>
        </div>
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
  },
  logo: {
    fontFamily: "'Exo 2', sans-serif", fontWeight: 800,
    fontSize: 30, letterSpacing: '0.14em', color: C.deepOlive,
    marginBottom: 4,
  },
  tagline: {
    fontFamily: "'Exo 2', sans-serif", fontWeight: 700,
    fontSize: 12, letterSpacing: '0.10em', color: C.pistachioGreen,
    marginBottom: 16, textAlign: 'center',
  },
  subtitle: {
    fontSize: 13, color: T.textMuted, marginBottom: 12, textAlign: 'center',
  },
  greeting: {
    fontSize: 18, fontWeight: 600, color: C.deepOlive, marginBottom: 4,
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
  passwordWrap: {
    position: 'relative', width: '100%',
  },
  passwordInput: {
    width: '100%', padding: '10px 42px 10px 14px',
    border: `1px solid ${T.surfaceBorder}`, borderRadius: 8,
    fontSize: 14, fontFamily: 'inherit', outline: 'none',
    background: '#fff', color: T.text,
    boxSizing: 'border-box',
  },
  pwHint: {
    fontSize: 11, color: T.textMuted, marginTop: -4, paddingLeft: 2,
  },
  eyeBtn: {
    position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: 18, padding: 4, lineHeight: 1,
  },
  btn: {
    width: '100%', padding: '11px 0', marginTop: 4,
    background: C.deepOlive, color: C.panelBg,
    border: 'none', borderRadius: 8, cursor: 'pointer',
    fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
  },
  linkRow: {
    marginTop: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
  },
  linkBtn: {
    marginTop: 0, background: 'none', border: 'none',
    color: T.textMuted, fontSize: 12, cursor: 'pointer',
    fontFamily: 'inherit', textDecoration: 'underline',
  },
  error: {
    padding: '8px 12px', borderRadius: 6,
    background: T.dangerBg, border: `1px solid ${T.dangerBorder}`,
    color: T.danger, fontSize: 12,
  },
  successBox: {
    padding: '16px', borderRadius: 8,
    background: T.accentBg, border: `1px solid ${T.brandBorder}`,
    textAlign: 'center', marginBottom: 8,
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
}
