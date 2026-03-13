import { useState, useEffect, useRef } from 'react'
import { POINT_TYPES } from '../constants/pointTypes'
import { api } from '../api'

const LEVEL_COLOR = {
  property:    '#16a34a',
  farm:        '#d97706',
  camp:        '#2563eb',
  observation: '#e11d48',
}

const CONDITION_OPTIONS = ['good', 'fair', 'poor', 'damaged']

export default function FeaturePanel({ feature, onClose, onSaved, onDeleted }) {
  const { featureType, data } = feature

  const [name, setName]           = useState(data.name || '')
  const [owner, setOwner]         = useState(data.owner || '')
  const [type, setType]           = useState(data.type || '')
  const [condition, setCondition] = useState(data.condition || '')
  const [notes, setNotes]         = useState(data.notes || '')
  const [saving, setSaving]           = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteReady, setDeleteReady] = useState(false)
  const [deleting, setDeleting]       = useState(false)
  const [dirty, setDirty]             = useState(false)
  const deleteTimerRef                = useRef(null)

  useEffect(() => {
    setName(data.name || '')
    setOwner(data.owner || '')
    setType(data.type || '')
    setCondition(data.condition || '')
    setNotes(data.notes || '')
    setDirty(false)
    setConfirmDelete(false)
    setDeleteReady(false)
    clearTimeout(deleteTimerRef.current)
  }, [data.id])

  useEffect(() => {
    if (confirmDelete) {
      setDeleteReady(false)
      deleteTimerRef.current = setTimeout(() => setDeleteReady(true), 2000)
    } else {
      setDeleteReady(false)
      clearTimeout(deleteTimerRef.current)
    }
    return () => clearTimeout(deleteTimerRef.current)
  }, [confirmDelete])

  const mark = () => setDirty(true)

  const accentColor =
    featureType === 'point_asset'
      ? (POINT_TYPES.find((t) => t.id === data.type)?.color ?? '#94a3b8')
      : (LEVEL_COLOR[data.level ?? featureType] ?? '#94a3b8')

  const badgeLabel =
    featureType === 'point_asset'
      ? (POINT_TYPES.find((t) => t.id === data.type)?.label ?? 'Point')
      : featureType === 'observation'
      ? 'OBSERVATION'
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
      } else if (featureType === 'observation') {
        await api.updateObservation(data.id, { notes })
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
    if (!data.id) { alert('Cannot delete: missing ID.'); return }
    if (!deleteReady) return
    setDeleting(true)
    try {
      if (featureType === 'property')         await api.deleteProperty(data.id)
      else if (featureType === 'area')        await api.deleteArea(data.id)
      else if (featureType === 'observation') await api.deleteObservation(data.id)
      else                                    await api.deletePointAsset(data.id)
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
          <span style={{ ...styles.badge, color: accentColor, borderColor: `${accentColor}35` }}>
            {badgeLabel}
          </span>
          {data.area_ha && (
            <span style={styles.meta}>{Number(data.area_ha).toLocaleString()} ha</span>
          )}
          {featureType === 'observation' && data.observed_at && (
            <span style={styles.meta}>
              {new Date(data.observed_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          )}
        </div>
        <button style={styles.closeBtn} onClick={onClose}>✕</button>
      </div>

      {/* Observation photo */}
      {featureType === 'observation' && data.image_url && (
        <div style={styles.photoWrap}>
          <img
            src={data.image_url}
            alt="Observation"
            style={styles.photo}
            onClick={() => window.open(data.image_url, '_blank')}
            title="Click to view full size"
          />
        </div>
      )}

      {/* Fields */}
      <div style={styles.fields}>
        {featureType !== 'observation' && (
          <Field label="Name" value={name} onChange={(v) => { setName(v); mark() }} />
        )}

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
              <select style={styles.input} value={type} onChange={(e) => { setType(e.target.value); mark() }}>
                {POINT_TYPES.map((pt) => (
                  <option key={pt.id} value={pt.id}>{pt.icon} {pt.label}</option>
                ))}
              </select>
            </label>
            <label style={styles.label}>
              Condition
              <select style={styles.input} value={condition} onChange={(e) => { setCondition(e.target.value); mark() }}>
                <option value="">— not set —</option>
                {CONDITION_OPTIONS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
          </>
        )}

        {featureType === 'observation' && (
          <div style={styles.readRow}>
            <span style={styles.readLabel}>Type</span>
            <span style={styles.readValue}>{(data.type || '—').replace(/_/g, ' ')}</span>
          </div>
        )}

        {featureType !== 'property' && (
          <Field
            label={featureType === 'observation' ? 'Comment' : 'Notes'}
            value={notes}
            onChange={(v) => { setNotes(v); mark() }}
            multiline
            placeholder="Optional notes…"
          />
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
            <span style={styles.confirmText}>
              {deleteReady ? 'Ready — click to confirm.' : 'Hold on… (2s safety delay)'}
            </span>
            <button
              style={{ ...styles.confirmYes, opacity: deleteReady ? 1 : 0.35, cursor: deleteReady ? 'pointer' : 'not-allowed' }}
              onClick={handleDelete}
              disabled={deleting || !deleteReady}
            >
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
    background: 'rgba(255, 255, 255, 0.97)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(0,0,0,0.08)',
    borderRadius: 12,
    boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
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
  meta: {
    display: 'block',
    color: 'rgba(0,0,0,0.35)',
    fontSize: 11,
    marginTop: 2,
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: 'rgba(0,0,0,0.3)',
    fontSize: 14,
    cursor: 'pointer',
    padding: 2,
    lineHeight: 1,
  },
  photoWrap: {
    flexShrink: 0,
    borderBottom: '1px solid rgba(0,0,0,0.06)',
  },
  photo: {
    width: '100%',
    height: 160,
    objectFit: 'cover',
    display: 'block',
    cursor: 'pointer',
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
    color: 'rgba(0,0,0,0.45)',
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
  },
  input: {
    background: 'rgba(0,0,0,0.03)',
    border: '1px solid rgba(0,0,0,0.1)',
    borderRadius: 6,
    color: '#111827',
    fontSize: 13,
    padding: '7px 10px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  },
  readRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  readLabel: {
    color: 'rgba(0,0,0,0.45)',
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
  },
  readValue: {
    color: '#111827',
    fontSize: 13,
    padding: '4px 0',
    textTransform: 'capitalize',
  },
  actions: {
    padding: '12px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    borderTop: '1px solid rgba(0,0,0,0.06)',
    flexShrink: 0,
  },
  saveBtn: {
    border: 'none',
    borderRadius: 6,
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    padding: '9px 0',
    cursor: 'pointer',
    width: '100%',
    fontFamily: 'inherit',
  },
  deleteBtn: {
    background: 'transparent',
    border: '1px solid rgba(220,38,38,0.2)',
    borderRadius: 6,
    color: 'rgba(220,38,38,0.65)',
    fontSize: 12,
    padding: '7px 0',
    cursor: 'pointer',
    width: '100%',
    fontFamily: 'inherit',
  },
  confirmRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  confirmText: {
    color: 'rgba(146,64,14,0.9)',
    fontSize: 11,
    flex: 1,
  },
  confirmYes: {
    background: 'rgba(220,38,38,0.08)',
    border: '1px solid rgba(220,38,38,0.3)',
    borderRadius: 5,
    color: '#dc2626',
    fontSize: 11,
    fontWeight: 600,
    padding: '5px 10px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  confirmNo: {
    background: 'transparent',
    border: '1px solid rgba(0,0,0,0.1)',
    borderRadius: 5,
    color: 'rgba(0,0,0,0.4)',
    fontSize: 11,
    padding: '5px 10px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
}
