import { useState, useRef } from 'react'
import exifr from 'exifr'
import { api } from '../api'

const OBS_TYPES = [
  { id: 'grass_condition',     label: 'Grass Condition'     },
  { id: 'erosion',             label: 'Erosion'             },
  { id: 'fence_damage',        label: 'Fence Damage'        },
  { id: 'livestock_presence',  label: 'Livestock Presence'  },
  { id: 'water',               label: 'Water / Borehole'    },
  { id: 'wildlife',            label: 'Wildlife'            },
  { id: 'other',               label: 'Other'               },
]

export default function ObservationModal({ propertyId, operations, onSaved, onCancel }) {
  const [file, setFile]               = useState(null)
  const [preview, setPreview]         = useState(null)
  const [exifData, setExifData]       = useState(null)   // { lat, lng, timestamp }
  const [exifLoading, setExifLoading] = useState(false)
  const [comment, setComment]         = useState('')
  const [obsType, setObsType]         = useState('other')
  const [operationId, setOperationId] = useState('')
  const [saving, setSaving]           = useState(false)
  const fileInputRef                  = useRef(null)

  const handleFileChange = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setPreview(URL.createObjectURL(f))
    setExifLoading(true)
    try {
      const exif = await exifr.parse(f, { gps: true, tiff: true, pick: ['GPSLatitude', 'GPSLongitude', 'DateTimeOriginal', 'CreateDate', 'latitude', 'longitude'] })
      setExifData({
        lat:       exif?.latitude   ?? null,
        lng:       exif?.longitude  ?? null,
        timestamp: exif?.DateTimeOriginal ?? exif?.CreateDate ?? null,
      })
    } catch {
      setExifData({ lat: null, lng: null, timestamp: null })
    } finally {
      setExifLoading(false)
    }
  }

  const resetPhoto = () => {
    setFile(null)
    setPreview(null)
    setExifData(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSave = async () => {
    if (!file) return
    setSaving(true)
    try {
      // 1. Upload image to Supabase Storage
      const imageUrl = await api.uploadObservationImage(file)

      // 2. Build GeoJSON point from EXIF GPS if available
      const geom = (exifData?.lat != null && exifData?.lng != null)
        ? { type: 'Point', coordinates: [exifData.lng, exifData.lat] }
        : null

      // 3. Save observation record via RPC
      await api.createObservation({
        propertyId,
        operationId: operationId || null,
        geom,
        observedAt: exifData?.timestamp ? new Date(exifData.timestamp).toISOString() : new Date().toISOString(),
        type:       obsType,
        notes:      comment.trim() || null,
        imageUrl,
      })

      onSaved()
    } catch (err) {
      alert('Save failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const formatTimestamp = (ts) => {
    if (!ts) return null
    try { return new Date(ts).toLocaleString() } catch { return null }
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.badge}>📷 OBSERVATION</div>
        <h3 style={styles.title}>Add Photo Observation</h3>

        {/* Photo picker / preview */}
        {!file ? (
          <div style={styles.dropzone} onClick={() => fileInputRef.current?.click()}>
            <span style={styles.dropIcon}>📷</span>
            <span style={styles.dropText}>Click to select a photo</span>
            <span style={styles.dropSub}>GPS coordinates &amp; timestamp extracted automatically from EXIF</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </div>
        ) : (
          <div style={styles.previewRow}>
            <img src={preview} style={styles.previewImg} alt="preview" />
            <div style={styles.exifBox}>
              {exifLoading ? (
                <span style={styles.exifLine}>Reading EXIF data…</span>
              ) : exifData?.lat != null ? (
                <>
                  <span style={{ ...styles.exifLine, color: '#16a34a' }}>
                    📍 {exifData.lat.toFixed(5)}, {exifData.lng.toFixed(5)}
                  </span>
                  {formatTimestamp(exifData.timestamp) && (
                    <span style={styles.exifLine}>
                      🕐 {formatTimestamp(exifData.timestamp)}
                    </span>
                  )}
                </>
              ) : (
                <span style={{ ...styles.exifLine, color: '#b45309' }}>
                  ⚠ No GPS in photo — will save without map location
                </span>
              )}
              <button style={styles.changeBtn} onClick={resetPhoto}>Change photo</button>
            </div>
          </div>
        )}

        {/* Form fields */}
        <div style={styles.form}>
          <label style={styles.label}>
            Observation type
            <select style={styles.input} value={obsType} onChange={(e) => setObsType(e.target.value)}>
              {OBS_TYPES.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </label>

          <label style={styles.label}>
            Comment
            <textarea
              style={{ ...styles.input, height: 72, resize: 'vertical' }}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="What did you observe? Describe conditions, issues, action needed…"
            />
          </label>

          {operations && operations.length > 0 && (
            <label style={styles.label}>
              Link to event <span style={styles.optional}>(optional)</span>
              <select style={styles.input} value={operationId} onChange={(e) => setOperationId(e.target.value)}>
                <option value="">— No event —</option>
                {operations.map((op) => (
                  <option key={op.id} value={op.id}>{op.name}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div style={styles.actions}>
          <button style={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button
            style={{ ...styles.saveBtn, opacity: (!file || saving) ? 0.45 : 1 }}
            onClick={handleSave}
            disabled={!file || saving}
          >
            {saving ? 'Uploading…' : 'Save Observation'}
          </button>
        </div>
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
    background: '#fff',
    border: '1px solid rgba(0,0,0,0.08)',
    borderTop: '3px solid #e11d48',
    borderRadius: 12,
    padding: 28,
    width: 420,
    boxShadow: '0 8px 40px rgba(0,0,0,0.15)',
    maxHeight: '90vh',
    overflowY: 'auto',
  },
  badge: {
    display: 'inline-block',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.1em',
    border: '1px solid rgba(225,29,72,0.3)',
    borderRadius: 4,
    padding: '2px 7px',
    marginBottom: 10,
    color: '#e11d48',
  },
  title: {
    color: '#111827',
    fontSize: 17,
    fontWeight: 600,
    marginBottom: 16,
  },
  dropzone: {
    border: '2px dashed rgba(0,0,0,0.12)',
    borderRadius: 8,
    padding: '28px 20px',
    textAlign: 'center',
    cursor: 'pointer',
    marginBottom: 16,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    transition: 'border-color 0.15s',
  },
  dropIcon: {
    fontSize: 28,
    lineHeight: 1,
  },
  dropText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: 500,
  },
  dropSub: {
    color: 'rgba(0,0,0,0.4)',
    fontSize: 12,
  },
  previewRow: {
    display: 'flex',
    gap: 12,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  previewImg: {
    width: 90,
    height: 90,
    objectFit: 'cover',
    borderRadius: 8,
    border: '1px solid rgba(0,0,0,0.08)',
    flexShrink: 0,
  },
  exifBox: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
    paddingTop: 2,
  },
  exifLine: {
    fontSize: 12,
    color: 'rgba(0,0,0,0.55)',
    lineHeight: 1.4,
  },
  changeBtn: {
    marginTop: 4,
    background: 'transparent',
    border: '1px solid rgba(0,0,0,0.1)',
    borderRadius: 5,
    color: 'rgba(0,0,0,0.45)',
    fontSize: 11,
    padding: '3px 8px',
    cursor: 'pointer',
    alignSelf: 'flex-start',
    fontFamily: 'inherit',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 13,
    marginBottom: 18,
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
    color: 'rgba(0,0,0,0.5)',
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
  },
  optional: {
    fontWeight: 400,
    textTransform: 'none',
    letterSpacing: 0,
    color: 'rgba(0,0,0,0.35)',
  },
  input: {
    background: 'rgba(0,0,0,0.03)',
    border: '1px solid rgba(0,0,0,0.1)',
    borderRadius: 6,
    color: '#111827',
    fontSize: 13,
    padding: '7px 10px',
    outline: 'none',
    fontFamily: 'inherit',
  },
  actions: {
    display: 'flex',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    background: 'transparent',
    border: '1px solid rgba(0,0,0,0.1)',
    borderRadius: 6,
    color: 'rgba(0,0,0,0.5)',
    fontSize: 13,
    padding: '9px 0',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  saveBtn: {
    flex: 2,
    background: '#e11d48',
    border: 'none',
    borderRadius: 6,
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    padding: '9px 0',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
}
