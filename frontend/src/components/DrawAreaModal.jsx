import { useState } from 'react'
import { T } from '../constants/theme'

const CONFIG = {
  draw_property: {
    title: 'Save Property',
    hint: 'Name this top-level land holding. Everything else lives inside it.',
    color: '#8FAF7A',
    showParent: false,
  },
  draw_farm: {
    title: 'Save Farm',
    hint: 'Name this farm within your property.',
    color: '#4C7A8C',
    showParent: false,
  },
  draw_camp: {
    title: 'Save Camp / Paddock',
    hint: 'Name this camp and select which farm it belongs to.',
    color: '#D4B646',
    showParent: true,
  },
}

export default function DrawAreaModal({ drawMode, properties, farms, onSave, onCancel, saving }) {
  const cfg = CONFIG[drawMode] || CONFIG.draw_property
  const [name, setName] = useState('')
  const [owner, setOwner] = useState('')
  const [parentId, setParentId] = useState(farms?.[0]?.id || '')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!name.trim()) return
    onSave({
      name: name.trim(),
      owner: owner.trim() || null,
      parentId: cfg.showParent ? parentId || null : null,
    })
  }

  return (
    <div style={styles.overlay}>
      <div style={{ ...styles.modal, borderTopColor: cfg.color }}>
        <div style={{ ...styles.badge, color: cfg.color, borderColor: `${cfg.color}30` }}>
          {drawMode === 'draw_property' ? 'PROPERTY' : drawMode === 'draw_farm' ? 'FARM' : 'CAMP'}
        </div>
        <h3 style={styles.title}>{cfg.title}</h3>
        <p style={styles.hint}>{cfg.hint}</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>
            Name *
            <input
              style={styles.input}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                drawMode === 'draw_property' ? 'e.g. Thornveld Holdings' :
                drawMode === 'draw_farm'     ? 'e.g. North Farm' :
                                              'e.g. Riverbed Camp'
              }
              autoFocus
            />
          </label>

          {drawMode === 'draw_property' && (
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
          )}

          {cfg.showParent && farms && farms.length > 0 && (
            <label style={styles.label}>
              Parent farm
              <select
                style={styles.input}
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
              >
                <option value="">— No parent (standalone) —</option>
                {farms.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </label>
          )}

          {cfg.showParent && (!farms || farms.length === 0) && (
            <p style={styles.warn}>
              ⚠ No farms found. Draw a Farm first, then assign camps to it.
            </p>
          )}

          <div style={styles.actions}>
            <button type="button" style={styles.cancelBtn} onClick={onCancel}>
              Discard
            </button>
            <button
              type="submit"
              style={{ ...styles.saveBtn, background: cfg.color, opacity: saving ? 0.6 : 1 }}
              disabled={saving || !name.trim()}
            >
              {saving ? 'Saving…' : `Save ${drawMode === 'draw_property' ? 'property' : drawMode === 'draw_farm' ? 'farm' : 'camp'}`}
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
    width: 380,
    boxShadow: '0 8px 40px rgba(47,47,47,0.15)',
  },
  badge: {
    display: 'inline-block',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.12em',
    border: '1px solid',
    borderRadius: 4,
    padding: '2px 7px',
    marginBottom: 10,
  },
  title: {
    color: T.text,
    fontSize: 17,
    fontWeight: 600,
    marginBottom: 6,
  },
  hint: {
    color: T.textMuted,
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
    fontSize: 14,
    padding: '8px 12px',
    outline: 'none',
    fontFamily: 'inherit',
  },
  warn: {
    color: T.warn,
    fontSize: 13,
    background: T.warnBg,
    border: `1px solid ${T.warnBorder}`,
    borderRadius: 6,
    padding: '8px 12px',
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
