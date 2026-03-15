import { useState, useEffect } from 'react'
import { api } from '../api'
import { T, C } from '../constants/theme'

const SEXES = [
  { value: 'bull',   label: 'Bull'   },
  { value: 'cow',    label: 'Cow'    },
  { value: 'heifer', label: 'Heifer' },
  { value: 'steer',  label: 'Steer'  },
  { value: 'calf',   label: 'Calf'   },
  { value: 'ram',    label: 'Ram'    },
  { value: 'ewe',    label: 'Ewe'    },
  { value: 'lamb',   label: 'Lamb'   },
  { value: 'wether', label: 'Wether' },
  { value: 'other',  label: 'Other'  },
]

const LOSS_TYPES = [
  { value: 'slaughter', label: 'Slaughtered' },
  { value: 'death',     label: 'Died'        },
  { value: 'lost',      label: 'Lost'        },
  { value: 'poached',   label: 'Poached'     },
  { value: 'sold',      label: 'Sold'        },
]

const styles = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 40,
    background: 'rgba(47,47,47,0.45)', backdropFilter: 'blur(2px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  modal: {
    background: T.surface, borderRadius: 12, padding: 24, width: 420, maxWidth: '95vw',
    maxHeight: '90vh', overflowY: 'auto',
    boxShadow: '0 8px 40px rgba(47,47,47,0.18)',
    borderTop: `4px solid ${T.brand}`,
  },
  badge: {
    display: 'inline-block', fontSize: 11, fontWeight: 700, letterSpacing: 1,
    color: T.brand, background: T.brandBg, borderRadius: 4,
    padding: '3px 10px', marginBottom: 8,
  },
  title: { fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 16 },
  label: { fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: T.textMuted, textTransform: 'uppercase', marginBottom: 4 },
  input: {
    width: '100%', padding: '8px 12px', borderRadius: 6, fontSize: 13,
    border: `1px solid ${T.surfaceBorder}`, background: T.surfaceBorder, color: T.text,
    fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none',
  },
  select: {
    width: '100%', padding: '8px 12px', borderRadius: 6, fontSize: 13,
    border: `1px solid ${T.surfaceBorder}`, background: T.surfaceBorder, color: T.text,
    fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none',
  },
  row: { marginBottom: 14 },
  toggleRow: { display: 'flex', gap: 8, marginBottom: 14 },
  toggleBtn: (active) => ({
    flex: 1, padding: '8px 0', borderRadius: 6, fontSize: 13, fontWeight: 600,
    border: active ? `2px solid ${T.brand}` : `1px solid ${T.surfaceBorder}`,
    background: active ? T.brandBg : T.surfaceBorder,
    color: active ? T.brand : T.textMuted, cursor: 'pointer', fontFamily: 'inherit',
    transition: 'all 0.12s',
  }),
  section: {
    borderTop: `1px solid ${T.surfaceBorder}`, paddingTop: 14, marginTop: 4,
  },
  sectionTitle: { fontSize: 10, fontWeight: 700, color: T.textMuted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 },
  actions: { display: 'flex', gap: 10, marginTop: 20 },
  btnCancel: {
    flex: 1, padding: '9px 0', borderRadius: 6, fontSize: 13, fontWeight: 600,
    border: `1px solid ${T.surfaceBorder}`, background: T.surfaceBorder, color: T.textMuted,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  btnSave: (saving) => ({
    flex: 2, padding: '9px 0', borderRadius: 6, fontSize: 13, fontWeight: 700,
    border: 'none', background: saving ? T.accent : T.brand, color: T.textOnDark,
    cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
  }),
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
}

// ── Add livestock modal ─────────────────────────────────────────────────────
export function AssignLivestockModal({ campId, campName, propertyId, onSaved, onClose }) {
  const [types,   setTypes]   = useState([])
  const [breeds,  setBreeds]  = useState([])
  const [typeId,  setTypeId]  = useState('')
  const [breedId, setBreedId] = useState('')
  const [isGroup, setIsGroup] = useState(true)
  const [headCount, setHeadCount] = useState(1)
  const [sex,     setSex]     = useState('')
  const [dob,     setDob]     = useState('')
  const [tagNumber, setTagNumber] = useState('')
  const [eid,     setEid]     = useState('')
  const [acquiredAt, setAcquiredAt] = useState('')
  const [notes,   setNotes]   = useState('')
  const [saving,  setSaving]  = useState(false)

  useEffect(() => {
    api.getLivestockTypes().then(setTypes).catch(console.error)
  }, [])

  useEffect(() => {
    if (!typeId) { setBreeds([]); setBreedId(''); return }
    api.getBreeds(typeId).then(setBreeds).catch(console.error)
  }, [typeId])

  // Group types by category for optgroup
  const domestic = types.filter((t) => t.category === 'domestic')
  const game     = types.filter((t) => t.category === 'game')

  const handleSave = async () => {
    if (!typeId) return alert('Please select a livestock type.')
    if (isGroup && headCount < 1) return alert('Head count must be at least 1.')
    setSaving(true)
    try {
      await api.createLivestock({
        propertyId,
        campId:      campId || null,
        typeId,
        breedId:     breedId || null,
        isGroup,
        headCount:   isGroup ? Number(headCount) : 1,
        sex:         !isGroup ? sex     : null,
        dob:         !isGroup ? dob     : null,
        tagNumber:   !isGroup ? tagNumber : null,
        acquiredAt:  acquiredAt || null,
        notes:       notes || null,
      })
      if (!isGroup && eid.trim()) {
        // EID tag stored separately — handled in DB via eid_tags
        // For now just note it — EID UI can be expanded later
      }
      onSaved()
    } catch (err) {
      alert('Failed to save: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={styles.modal}>
        <div style={styles.badge}>🐄 LIVESTOCK</div>
        <div style={styles.title}>Add Livestock</div>

        {campName && (
          <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 14 }}>
            Assigning to <strong style={{ color: T.text }}>{campName}</strong>
          </div>
        )}

        <div style={styles.row}>
          <div style={styles.label}>Type</div>
          <select style={styles.select} value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            <option value="">Select type…</option>
            {domestic.length > 0 && (
              <optgroup label="Domestic">
                {domestic.map((t) => (
                  <option key={t.id} value={t.id}>{t.emoji} {t.common_name}</option>
                ))}
              </optgroup>
            )}
            {game.length > 0 && (
              <optgroup label="Game">
                {game.map((t) => (
                  <option key={t.id} value={t.id}>{t.emoji} {t.common_name}</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        {breeds.length > 0 && (
          <div style={styles.row}>
            <div style={styles.label}>Breed</div>
            <select style={styles.select} value={breedId} onChange={(e) => setBreedId(e.target.value)}>
              <option value="">Unknown / Mixed</option>
              {breeds.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}

        <div style={styles.row}>
          <div style={styles.label}>Record type</div>
          <div style={styles.toggleRow}>
            <button style={styles.toggleBtn(isGroup)}  onClick={() => setIsGroup(true)}>Group / Mob</button>
            <button style={styles.toggleBtn(!isGroup)} onClick={() => setIsGroup(false)}>Individual</button>
          </div>
        </div>

        {isGroup ? (
          <div style={styles.grid2}>
            <div>
              <div style={styles.label}>Head count</div>
              <input type="number" min={1} style={styles.input} value={headCount}
                onChange={(e) => setHeadCount(e.target.value)} />
            </div>
            <div>
              <div style={styles.label}>Acquired date</div>
              <input type="date" style={styles.input} value={acquiredAt}
                onChange={(e) => setAcquiredAt(e.target.value)} />
            </div>
          </div>
        ) : (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Individual details</div>
            <div style={styles.grid2}>
              <div>
                <div style={styles.label}>Sex</div>
                <select style={styles.select} value={sex} onChange={(e) => setSex(e.target.value)}>
                  <option value="">Unknown</option>
                  {SEXES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <div style={styles.label}>Date of birth</div>
                <input type="date" style={styles.input} value={dob} onChange={(e) => setDob(e.target.value)} />
              </div>
              <div>
                <div style={styles.label}>Tag number</div>
                <input type="text" style={styles.input} placeholder="Visual tag" value={tagNumber}
                  onChange={(e) => setTagNumber(e.target.value)} />
              </div>
              <div>
                <div style={styles.label}>EID</div>
                <input type="text" style={styles.input} placeholder="Electronic ID" value={eid}
                  onChange={(e) => setEid(e.target.value)} />
              </div>
              <div>
                <div style={styles.label}>Acquired date</div>
                <input type="date" style={styles.input} value={acquiredAt}
                  onChange={(e) => setAcquiredAt(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        <div style={{ ...styles.row, marginTop: 14 }}>
          <div style={styles.label}>Notes</div>
          <textarea rows={2} style={{ ...styles.input, resize: 'vertical' }} value={notes}
            onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div style={styles.actions}>
          <button style={styles.btnCancel} onClick={onClose}>Cancel</button>
          <button style={styles.btnSave(saving)} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Add Livestock'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Record loss modal ───────────────────────────────────────────────────────
export function RecordLossModal({ livestock, onSaved, onClose }) {
  const [eventType, setEventType] = useState('slaughter')
  const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10))
  const [headCount, setHeadCount] = useState(1)
  const [notes,     setNotes]     = useState('')
  const [saving,    setSaving]    = useState(false)

  const maxCount = livestock?.alive_count ?? livestock?.head_count ?? 1

  const handleSave = async () => {
    if (headCount < 1 || headCount > maxCount)
      return alert(`Count must be between 1 and ${maxCount}.`)
    setSaving(true)
    try {
      await api.createLivestockEvent({
        livestockId: livestock.id,
        eventType,
        eventDate,
        headCount:   Number(headCount),
        notes:       notes || null,
      })
      onSaved()
    } catch (err) {
      alert('Failed to record loss: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ ...styles.modal, borderTopColor: T.danger, width: 360 }}>
        <div style={{ ...styles.badge, color: T.danger, background: T.dangerBg }}>RECORD LOSS</div>
        <div style={styles.title}>
          {livestock?.emoji} {livestock?.common_name}
          {livestock?.breed_name ? ` — ${livestock.breed_name}` : ''}
        </div>
        <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 16 }}>
          Current alive count: <strong style={{ color: T.text }}>{maxCount}</strong>
        </div>

        <div style={styles.row}>
          <div style={styles.label}>Reason</div>
          <select style={styles.select} value={eventType} onChange={(e) => setEventType(e.target.value)}>
            {LOSS_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        <div style={styles.grid2}>
          <div>
            <div style={styles.label}>Head count</div>
            <input type="number" min={1} max={maxCount} style={styles.input}
              value={headCount} onChange={(e) => setHeadCount(e.target.value)} />
          </div>
          <div>
            <div style={styles.label}>Date</div>
            <input type="date" style={styles.input} value={eventDate}
              onChange={(e) => setEventDate(e.target.value)} />
          </div>
        </div>

        <div style={{ ...styles.row, marginTop: 14 }}>
          <div style={styles.label}>Notes</div>
          <textarea rows={2} style={{ ...styles.input, resize: 'vertical' }} value={notes}
            onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div style={styles.actions}>
          <button style={styles.btnCancel} onClick={onClose}>Cancel</button>
          <button style={{ ...styles.btnSave(saving), background: saving ? T.dangerBorder : T.danger }}
            onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Record Loss'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Move livestock modal ─────────────────────────────────────────────────────
export function MoveLivestockModal({ livestock, camps, onSaved, onClose }) {
  const [targetCampId, setTargetCampId] = useState('')
  const [headCount, setHeadCount] = useState(livestock?.alive_count ?? livestock?.head_count ?? 1)
  const [saving, setSaving] = useState(false)

  const maxCount = livestock?.alive_count ?? livestock?.head_count ?? 1
  const availableCamps = camps.filter((c) => c.id !== livestock?.camp_id)

  const handleSave = async () => {
    if (!targetCampId) return alert('Please select a destination camp.')
    const n = Number(headCount)
    if (n < 1 || n > maxCount) return alert(`Count must be between 1 and ${maxCount}.`)
    setSaving(true)
    try {
      // Log 'moved' as a deduction against the original record
      await api.createLivestockEvent({
        livestockId: livestock.id,
        eventType:   'moved',
        eventDate:   new Date().toISOString().slice(0, 10),
        headCount:   n,
        campFrom:    livestock.camp_id || null,
        campTo:      targetCampId,
      })
      // Create a new record in the target camp with the moved count
      await api.createLivestock({
        propertyId: livestock.property_id,
        campId:     targetCampId,
        typeId:     livestock.livestock_type_id,
        breedId:    livestock.breed_id || null,
        isGroup:    livestock.is_group,
        headCount:  n,
        notes:      livestock.notes || null,
      })
      onSaved()
    } catch (err) {
      alert('Failed to move: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ ...styles.modal, borderTopColor: C.dustyBlue, width: 360 }}>
        <div style={{ ...styles.badge, color: C.dustyBlue, background: C.dustyBlue + '14' }}>MOVE LIVESTOCK</div>
        <div style={styles.title}>
          {livestock?.emoji} {livestock?.alive_count ?? livestock?.head_count} {livestock?.common_name}
        </div>

        <div style={styles.grid2}>
          <div>
            <div style={styles.label}>Head count</div>
            <input type="number" min={1} max={maxCount} style={styles.input}
              value={headCount} onChange={(e) => setHeadCount(e.target.value)} />
            <div style={{ fontSize: 11, color: T.textFaint, marginTop: 3 }}>Max: {maxCount}</div>
          </div>
          <div>
            <div style={styles.label}>Move to camp</div>
            <select style={styles.select} value={targetCampId} onChange={(e) => setTargetCampId(e.target.value)}>
              <option value="">Select…</option>
              {availableCamps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        <div style={styles.actions}>
          <button style={styles.btnCancel} onClick={onClose}>Cancel</button>
          <button style={{ ...styles.btnSave(saving), background: saving ? C.dustyBlue + '88' : C.dustyBlue }}
            onClick={handleSave} disabled={saving}>
            {saving ? 'Moving…' : 'Move Livestock'}
          </button>
        </div>
      </div>
    </div>
  )
}
