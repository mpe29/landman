import { useState } from 'react'
import { POINT_TYPES, pointTypeFromMode } from '../constants/pointTypes'
import { T } from '../constants/theme'

export default function DrawPointModal({ drawMode, onSave, onCancel, saving }) {
  const pt = pointTypeFromMode(drawMode) ?? POINT_TYPES[0]

  const [name, setName]           = useState('')
  const [type, setType]           = useState(pt.id)
  const [condition, setCondition] = useState('')
  const [notes, setNotes]         = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!name.trim()) return
    onSave({ name: name.trim(), type, condition: condition || null, notes: notes.trim() || null })
  }

  const activePt = POINT_TYPES.find((t) => t.id === type) ?? pt

  return (
    <div style={styles.overlay}>
      <div style={{ ...styles.modal, borderTopColor: activePt.color }}>
        <div style={{ ...styles.badge, color: activePt.color, borderColor: `${activePt.color}40` }}>
          {activePt.icon} {activePt.label.toUpperCase()}
        </div>
        <h3 style={styles.title}>Add {activePt.label}</h3>

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>
            Name *
            <input
              style={styles.input}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`e.g. ${pt.id === 'borehole' ? 'BH-001' : pt.id === 'kraal' ? 'Main Kraal' : pt.id === 'campsite' ? 'Staff Camp' : 'North Lodge'}`}
              autoFocus
            />
          </label>

          <label style={styles.label}>
            Type
            <select style={styles.input} value={type} onChange={(e) => setType(e.target.value)}>
              {POINT_TYPES.map((t) => (
                <option key={t.id} value={t.id}>{t.icon} {t.label}</option>
              ))}
            </select>
          </label>

          <label style={styles.label}>
            Condition
            <select style={styles.input} value={condition} onChange={(e) => setCondition(e.target.value)}>
              <option value="">— not set —</option>
              <option value="good">Good</option>
              <option value="fair">Fair</option>
              <option value="poor">Poor</option>
              <option value="damaged">Damaged</option>
            </select>
          </label>

          <label style={styles.label}>
            Notes
            <textarea
              style={{ ...styles.input, height: 60, resize: 'vertical' }}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes…"
            />
          </label>

          <div style={styles.actions}>
            <button type="button" style={styles.cancelBtn} onClick={onCancel}>Discard</button>
            <button
              type="submit"
              style={{ ...styles.saveBtn, background: activePt.color, opacity: saving ? 0.6 : 1 }}
              disabled={saving || !name.trim()}
            >
              {saving ? 'Saving…' : `Save ${activePt.label}`}
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
    background: 'rgba(0,0,0,0.35)',
    backdropFilter: 'blur(4px)',
  },
  modal: {
    background: T.surface,
    border: `1px solid ${T.surfaceBorder}`,
    borderTop: '3px solid',
    borderRadius: 12,
    padding: 28,
    width: 360,
    boxShadow: '0 8px 40px rgba(47,47,47,0.15)',
  },
  badge: {
    display: 'inline-block',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.1em',
    border: '1px solid',
    borderRadius: 4,
    padding: '2px 7px',
    marginBottom: 10,
  },
  title: {
    color: T.text,
    fontSize: 17,
    fontWeight: 600,
    marginBottom: 18,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 13,
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
    color: T.textMuted,
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
  },
  input: {
    background: T.surfaceBorder,
    border: `1px solid ${T.surfaceBorder}`,
    borderRadius: 6,
    color: T.text,
    fontSize: 13,
    padding: '7px 10px',
    outline: 'none',
    fontFamily: 'inherit',
  },
  actions: {
    display: 'flex',
    gap: 10,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    background: 'transparent',
    border: `1px solid ${T.surfaceBorder}`,
    borderRadius: 6,
    color: T.textMuted,
    fontSize: 13,
    padding: '9px 0',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  saveBtn: {
    flex: 2,
    border: 'none',
    borderRadius: 6,
    color: T.textOnDark,
    fontSize: 13,
    fontWeight: 700,
    padding: '9px 0',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
}
