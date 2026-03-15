import { useState, useEffect, useRef } from 'react'
import { POINT_TYPES } from '../constants/pointTypes'
import { api } from '../api'
import { AssignLivestockModal, RecordLossModal, MoveLivestockModal } from './AssignLivestockModal'
import { T, C } from '../constants/theme'

const LEVEL_COLOR = {
  property:    C.pistachioGreen,
  farm:        C.dryGrassYellow,
  camp:        C.dustyBlue,
  observation: C.burntOrange,
}

const CONDITION_OPTIONS = ['good', 'fair', 'poor', 'damaged']

function bearingToCardinal(deg) {
  const dirs = ['N','NE','E','SE','S','SW','W','NW']
  return dirs[Math.round(deg / 45) % 8]
}

export default function FeaturePanel({ feature, onClose, onSaved, onDeleted, camps, propertyId, tagTypes = [] }) {
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

  // Observation tags
  const [obsTags,       setObsTags]       = useState([])
  const [tagPickerOpen, setTagPickerOpen] = useState(false)

  useEffect(() => {
    if (featureType !== 'observation') return
    api.getObservationTags(data.id).then(setObsTags).catch(console.error)
  }, [data.id, featureType]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddTag = async (tagTypeId) => {
    await api.addObservationTag(data.id, tagTypeId)
    const updated = await api.getObservationTags(data.id)
    setObsTags(updated)
    setTagPickerOpen(false)
  }

  const handleRemoveTag = async (tagTypeId) => {
    await api.removeObservationTag(data.id, tagTypeId)
    setObsTags((prev) => prev.filter((t) => t.id !== tagTypeId))
  }

  // Livestock state (camps only)
  const [livestock,        setLivestock]        = useState([])
  const [showAddLivestock, setShowAddLivestock] = useState(false)
  const [lossTarget,       setLossTarget]       = useState(null)
  const [moveTarget,       setMoveTarget]       = useState(null)

  const isCamp = featureType === 'area' && data.level === 'camp'

  useEffect(() => {
    if (!isCamp) return
    api.getLivestockForCamp(data.id).then(setLivestock).catch(console.error)
  }, [data.id, isCamp]) // eslint-disable-line react-hooks/exhaustive-deps

  const reloadLivestock = () => {
    api.getLivestockForCamp(data.id).then(setLivestock).catch(console.error)
    onSaved?.()
  }

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
    <>
    {showAddLivestock && (
      <AssignLivestockModal
        campId={data.id}
        campName={data.name}
        propertyId={propertyId}
        onSaved={() => { setShowAddLivestock(false); reloadLivestock() }}
        onClose={() => setShowAddLivestock(false)}
      />
    )}
    {lossTarget && (
      <RecordLossModal
        livestock={lossTarget}
        onSaved={() => { setLossTarget(null); reloadLivestock() }}
        onClose={() => setLossTarget(null)}
      />
    )}
    {moveTarget && (
      <MoveLivestockModal
        livestock={moveTarget}
        camps={camps || []}
        onSaved={() => { setMoveTarget(null); reloadLivestock() }}
        onClose={() => setMoveTarget(null)}
      />
    )}
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
          {isCamp && (
            <span style={styles.meta}>
              🐄 {Number(data.livestock_count ?? 0).toLocaleString()} head
            </span>
          )}
          {featureType === 'observation' && data.observed_at && (
            <span style={styles.meta}>
              {new Date(data.observed_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
              {data.bearing != null && (
                <span style={styles.bearing}> · {bearingToCardinal(data.bearing)} {data.bearing}°</span>
              )}
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

        {/* Tag section — observations only, shown above comment */}
        {featureType === 'observation' && (
          <div style={styles.tagSection}>
            <div style={styles.tagHeader}>
              <span style={styles.tagSectionLabel}>TAGS</span>
              <button style={styles.tagAddBtn} onClick={() => setTagPickerOpen((o) => !o)}>
                {tagPickerOpen ? '✕' : '+ Add'}
              </button>
            </div>

            {/* Current tags */}
            <div style={styles.tagChipRow}>
              {obsTags.length === 0 && !tagPickerOpen && (
                <span style={styles.tagEmpty}>No tags — add one to help filter later</span>
              )}
              {obsTags.map((tt) => (
                <span key={tt.id} style={{ ...styles.tagChip, borderColor: tt.color, color: tt.color, background: tt.color + '14' }}>
                  {tt.emoji} {tt.name}
                  <button
                    style={styles.tagRemoveBtn}
                    onClick={() => handleRemoveTag(tt.id)}
                    title="Remove tag"
                  >×</button>
                </span>
              ))}
            </div>

            {/* Tag picker */}
            {tagPickerOpen && (
              <div style={styles.tagPicker}>
                {tagTypes
                  .filter((tt) => !obsTags.find((t) => t.id === tt.id))
                  .map((tt) => (
                    <button
                      key={tt.id}
                      style={styles.tagPickerItem}
                      onClick={() => handleAddTag(tt.id)}
                    >
                      <span>{tt.emoji}</span>
                      <span>{tt.name}</span>
                    </button>
                  ))}
                {tagTypes.filter((tt) => !obsTags.find((t) => t.id === tt.id)).length === 0 && (
                  <span style={styles.tagEmpty}>All tags applied</span>
                )}
              </div>
            )}
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

        {/* Livestock section — camps only */}
        {isCamp && (
          <div style={styles.livestockSection}>
            <div style={styles.livestockHeader}>
              <span style={styles.sectionTitle}>Livestock</span>
              <button style={styles.addBtn} onClick={() => setShowAddLivestock(true)}>+ Add</button>
            </div>

            {livestock.length === 0 ? (
              <div style={styles.emptyText}>No livestock assigned to this camp.</div>
            ) : (
              livestock.map((row) => (
                <div key={row.id} style={styles.livestockRow}>
                  <div style={styles.livestockInfo}>
                    <span style={styles.livestockEmoji}>{row.emoji}</span>
                    <div>
                      <div style={styles.livestockName}>
                        {row.alive_count} {row.common_name}
                        {row.breed_name ? ` · ${row.breed_name}` : ''}
                        {!row.is_group && row.tag_number ? ` · #${row.tag_number}` : ''}
                      </div>
                      <div style={styles.livestockSub}>
                        {row.is_group ? 'Group' : 'Individual'}
                        {row.sex ? ` · ${row.sex}` : ''}
                      </div>
                    </div>
                  </div>
                  <div style={styles.livestockActions}>
                    <button style={styles.smallBtn} onClick={() => setMoveTarget(row)}>Move</button>
                    <button style={{ ...styles.smallBtn, color: T.danger, borderColor: T.dangerBorder }}
                      onClick={() => setLossTarget(row)}>Loss</button>
                  </div>
                </div>
              ))
            )}
          </div>
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
    </>
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
    background: T.surface,
    backdropFilter: 'blur(12px)',
    border: `1px solid ${T.surfaceBorder}`,
    borderRadius: 12,
    boxShadow: '0 4px 24px rgba(47,47,47,0.12)',
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
    color: T.textFaint,
    fontSize: 11,
    marginTop: 2,
  },
  bearing: {
    color: T.textFaint,
    fontSize: 11,
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: T.textFaint,
    fontSize: 14,
    cursor: 'pointer',
    padding: 2,
    lineHeight: 1,
  },
  photoWrap: {
    flexShrink: 0,
    borderBottom: `1px solid ${T.surfaceBorder}`,
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
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  },
  actions: {
    padding: '12px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    borderTop: `1px solid ${T.surfaceBorder}`,
    flexShrink: 0,
  },
  saveBtn: {
    border: 'none',
    borderRadius: 6,
    color: T.textOnDark,
    fontSize: 13,
    fontWeight: 700,
    padding: '9px 0',
    cursor: 'pointer',
    width: '100%',
    fontFamily: 'inherit',
  },
  deleteBtn: {
    background: 'transparent',
    border: `1px solid ${T.dangerBorder}`,
    borderRadius: 6,
    color: T.danger,
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
    color: C.burntOrange,
    fontSize: 11,
    flex: 1,
  },
  confirmYes: {
    background: T.dangerBg,
    border: `1px solid ${T.dangerBorder}`,
    borderRadius: 5,
    color: T.danger,
    fontSize: 11,
    fontWeight: 600,
    padding: '5px 10px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  confirmNo: {
    background: 'transparent',
    border: `1px solid ${T.surfaceBorder}`,
    borderRadius: 5,
    color: T.textMuted,
    fontSize: 11,
    padding: '5px 10px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  tagSection: {
    borderTop: `1px solid ${T.surfaceBorder}`,
    paddingTop: 12, marginTop: 4,
    display: 'flex', flexDirection: 'column', gap: 8,
  },
  tagHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  tagSectionLabel: {
    fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
    textTransform: 'uppercase', color: T.textMuted,
  },
  tagAddBtn: {
    fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 5,
    border: `1.5px solid ${C.burntOrange}55`, background: C.burntOrange + '12',
    color: C.burntOrange, cursor: 'pointer', fontFamily: 'inherit',
  },
  tagChipRow: {
    display: 'flex', flexWrap: 'wrap', gap: 5,
    minHeight: 24,
  },
  tagChip: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '3px 8px', borderRadius: 12,
    border: '1px solid', fontSize: 11, fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  tagRemoveBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'inherit', fontSize: 13, lineHeight: 1, padding: 0,
    opacity: 0.6, fontFamily: 'inherit',
  },
  tagEmpty: {
    fontSize: 11, color: T.textFaint, fontStyle: 'italic',
  },
  tagPicker: {
    display: 'flex', flexDirection: 'column', gap: 2,
    background: T.surfaceBorder, borderRadius: 7,
    padding: 6, border: `1px solid ${T.surfaceBorder}`,
  },
  tagPickerItem: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: 'transparent', border: 'none', cursor: 'pointer',
    padding: '5px 8px', borderRadius: 5, fontSize: 12,
    color: T.text, fontFamily: 'inherit', textAlign: 'left',
  },
  livestockSection: {
    borderTop: `1px solid ${T.surfaceBorder}`,
    paddingTop: 12,
    marginTop: 4,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  livestockHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: T.textMuted,
  },
  addBtn: {
    fontSize: 11,
    fontWeight: 700,
    padding: '3px 9px',
    borderRadius: 5,
    border: `1.5px solid ${T.brandBorder}`,
    background: T.brandBg,
    color: T.brand,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  emptyText: {
    fontSize: 12,
    color: T.textFaint,
    fontStyle: 'italic',
  },
  livestockRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '7px 10px',
    background: T.surfaceBorder,
    borderRadius: 7,
    gap: 8,
  },
  livestockInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  livestockEmoji: { fontSize: 18, flexShrink: 0 },
  livestockName: {
    fontSize: 12,
    fontWeight: 600,
    color: T.text,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  livestockSub: {
    fontSize: 11,
    color: T.textMuted,
    textTransform: 'capitalize',
  },
  livestockActions: { display: 'flex', gap: 5, flexShrink: 0 },
  smallBtn: {
    fontSize: 10,
    fontWeight: 600,
    padding: '3px 7px',
    borderRadius: 4,
    border: `1px solid ${T.surfaceBorder}`,
    background: 'transparent',
    color: T.textMuted,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
}
