import { useState, useEffect } from 'react'
import { POINT_TYPES } from '../constants/pointTypes'
import { api } from '../api'

const LEVEL_COLOR = {
  property: '#4ade80',
  farm:     '#fbbf24',
  camp:     '#60a5fa',
}

const CONDITION_OPTIONS = ['good', 'fair', 'poor', 'damaged']

export default function FeaturePanel({ feature, onClose, onSaved, onDeleted }) {
  const { featureType, data } = feature

  const [name, setName]           = useState(data.name || '')
  const [owner, setOwner]         = useState(data.owner || '')
  const [type, setType]           = useState(data.type || '')
  const [condition, setCondition] = useState(data.condition || '')
  const [notes, setNotes]         = useState(data.notes || '')
  const [saving, setSaving]       = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting]   = useState(false)
  const [dirty, setDirty]         = useState(false)

  // Reset form whenever the selected feature changes
  useEffect(() => {
    setName(data.name || '')
    setOwner(data.owner || '')
    setType(data.type || '')
    setCondition(data.condition || '')
    setNotes(data.notes || '')
    setDirty(false)
    setConfirmDelete(false)
  }, [data.id])

  const mark = () => setDirty(true)

  const accentColor =
    featureType === 'point_asset'
      ? (POINT_TYPES.find((t) => t.id === data.type)?.color ?? '#94a3b8')
      : (LEVEL_COLOR[data.level ?? featureType] ?? '#94a3b8')

  const badgeLabel =
    featureType === 'point_asset'
      ? (POINT_TYPES.find((t) => t.id === data.type)?.label ?? 'Point')
      : (data.level ?? featureType ?? '').toUpperCase()

  const handleSave = async () => {
    setSaving(true)
    try {
      if (featureType === 'property') {
        await api.updateProperty(data.id, { name, owner })
      } else if (featureType === 'area') {
        await api.updateArea(data.id, { name, type, notes })
      } else if (featureType === 'point_asset') {
        await api.updatePointAsset(data.id, { name, type, condition, notes })
      }
      setDirty(false)
      onSaved?.()
    } catch (err) {
      alert('Save failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      if (featureType === 'property')   await api.deleteProperty(data.id)
      else if (featureType === 'area')  await api.deleteArea(data.id)
      else                              await api.deletePointAsset(data.id)
      onDeleted?.()
    } catch (err) {
      alert('Delete failed: ' + err.message)
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <div style={styles.panel}>
      {/* Header */}
      <div style={{ ...styles.header, borderLeftColor: accentColor }}>
        <div>
          <span style={{ ...styles.badge, color: accentColor, borderColor: `${accentColor}40` }}>
            {badgeLabel}
          </span>
          {data.area_ha && (
            <span style={styles.hectares}>{Number(data.area_ha).toLocaleString()} ha</span>
          )}
        </div>
        <button style={styles.closeBtn} onClick={onClose}>✕</button>
      </div>

      {/* Fields */}
      <div style={styles.fields}>
        <Field label="Name" value={name} onChange={(v) => { setName(v); mark() }} />

        {featureType === 'property' && (
          <Field label="Owner" value={owner} onChange={(v) => { setOwner(v); mark() }} />
        )}

        {featureType === 'area' && (
          <Field label="Type / subcategory" value={type} onChange={(v) => { setType(v); mark() }}
            placeholder="e.g. grazing, game, bushveld" />
        )}

        {featureType === 'point_asset' && (
          <>
            <label style={styles.label}>
              Type
              <select
                style={styles.input}
                value={type}
                onChange={(e) => { setType(e.target.value); mark() }}
              >
                {POINT_TYPES.map((pt) => (
                  <option key={pt.id} value={pt.id}>{pt.icon} {pt.label}</option>
                ))}
              </select>
            </label>
            <label style={styles.label}>
              Condition
              <select
                style={styles.input}
                value={condition}
                onChange={(e) => { setCondition(e.target.value); mark() }}
              >
                <option value="">— not set —</option>
                {CONDITION_OPTIONS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
          </>
        )}

        {featureType !== 'property' && (
          <Field label="Notes" value={notes} onChange={(v) => { setNotes(v); mark() }}
            multiline placeholder="Optional notes…" />
        )}
      </div>

      {/* Actions */}
      <div style={styles.actions}>
        {dirty && (
          <button
            style={{ ...styles.saveBtn, background: accentColor, opacity: saving ? 0.6 : 1 }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        )}

        {!confirmDelete ? (
          <button style={styles.deleteBtn} onClick={() => setConfirmDelete(true)}>
            Delete
          </button>
        ) : (
          <div style={styles.confirmRow}>
            <span style={styles.confirmText}>Sure? This cannot be undone.</span>
            <button style={styles.confirmYes} onClick={handleDelete} disabled={deleting}>
              {deleting ? '…' : 'Yes, delete'}
            </button>
            <button style={styles.confirmNo} onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, multiline }) {
  const inputStyle = { ...styles.input, ...(multiline ? { height: 70, resize: 'vertical' } : {}) }
  return (
    <label style={styles.label}>
      {label}
      {multiline
        ? <textarea style={inputStyle} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
        : <input style={inputStyle} type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      }
    </label>
  )
}

const styles = {
  panel: {
    position: 'absolute',
    top: 16,
    right: 16,
    bottom: 16,
    zIndex: 10,
    width: 290,
    background: 'rgba(15, 20, 25, 0.94)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: 12,
    boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: '14px 16px 10px',
    borderLeft: '3px solid',
    flexShrink: 0,
  },
  badge: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.1em',
    border: '1px solid',
    borderRadius: 4,
    padding: '2px 6px',
    display: 'inline-block',
    marginBottom: 4,
  },
  hectares: {
    display: 'block',
    color: 'rgba(255,255,255,0.35)',
    fontSize: 11,
    marginTop: 2,
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: 'rgba(255,255,255,0.3)',
    fontSize: 14,
    cursor: 'pointer',
    padding: 2,
    lineHeight: 1,
  },
  fields: {
    flex: 1,
    overflowY: 'auto',
    padding: '10px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
  },
  input: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6,
    color: '#fff',
    fontSize: 13,
    padding: '7px 10px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  actions: {
    padding: '12px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    borderTop: '1px solid rgba(255,255,255,0.07)',
    flexShrink: 0,
  },
  saveBtn: {
    border: 'none',
    borderRadius: 6,
    color: '#0f1419',
    fontSize: 13,
    fontWeight: 700,
    padding: '9px 0',
    cursor: 'pointer',
    width: '100%',
  },
  deleteBtn: {
    background: 'transparent',
    border: '1px solid rgba(255,80,80,0.25)',
    borderRadius: 6,
    color: 'rgba(255,100,100,0.6)',
    fontSize: 12,
    padding: '7px 0',
    cursor: 'pointer',
    width: '100%',
  },
  confirmRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  confirmText: {
    color: 'rgba(255,200,100,0.8)',
    fontSize: 11,
    flex: 1,
  },
  confirmYes: {
    background: 'rgba(255,60,60,0.15)',
    border: '1px solid rgba(255,60,60,0.4)',
    borderRadius: 5,
    color: '#ff6060',
    fontSize: 11,
    fontWeight: 600,
    padding: '5px 10px',
    cursor: 'pointer',
  },
  confirmNo: {
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 5,
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    padding: '5px 10px',
    cursor: 'pointer',
  },
}
