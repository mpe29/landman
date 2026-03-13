import { useState } from 'react'

export default function DrawPropertyModal({ onSave, onCancel, saving }) {
  const [name, setName] = useState('')
  const [owner, setOwner] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!name.trim()) return
    onSave({ name: name.trim(), owner: owner.trim() || null })
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <h3 style={styles.title}>Save Property</h3>
        <p style={styles.hint}>
          Your boundary has been drawn. Give this property a name to save it.
        </p>
        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>
            Property name *
            <input
              style={styles.input}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Thornveld Game Reserve"
              autoFocus
            />
          </label>
          <label style={styles.label}>
            Owner
            <input
              style={styles.input}
              type="text"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              placeholder="Optional"
            />
          </label>
          <div style={styles.actions}>
            <button type="button" style={styles.cancelBtn} onClick={onCancel}>
              Discard
            </button>
            <button
              type="submit"
              style={{ ...styles.saveBtn, opacity: saving ? 0.6 : 1 }}
              disabled={saving || !name.trim()}
            >
              {saving ? 'Saving…' : 'Save property'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const styles = {
  overlay: {
    position: 'absolute',
    inset: 0,
    zIndex: 20,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.5)',
    backdropFilter: 'blur(3px)',
  },
  modal: {
    background: '#0f1419',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 28,
    width: 360,
    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
  },
  title: {
    color: '#fff',
    fontSize: 17,
    fontWeight: 600,
    marginBottom: 8,
  },
  hint: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    marginBottom: 20,
    lineHeight: 1.5,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  input: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 6,
    color: '#fff',
    fontSize: 14,
    padding: '8px 12px',
    outline: 'none',
  },
  actions: {
    display: 'flex',
    gap: 10,
    marginTop: 6,
  },
  cancelBtn: {
    flex: 1,
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 6,
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    padding: '9px 0',
    cursor: 'pointer',
  },
  saveBtn: {
    flex: 2,
    background: '#4ade80',
    border: 'none',
    borderRadius: 6,
    color: '#0f1419',
    fontSize: 13,
    fontWeight: 600,
    padding: '9px 0',
    cursor: 'pointer',
  },
}
