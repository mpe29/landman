import { useState, useRef, useCallback } from 'react'
import exifr from 'exifr'
import { api } from '../api'
import { T, C } from '../constants/theme'

// Convert magnetic bearing (0–360°) to 8-point cardinal abbreviation
function bearingToCardinal(deg) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return dirs[Math.round(deg / 45) % 8]
}

let _nextId = 0

async function readExif(file) {
  try {
    const exif = await exifr.parse(file, { gps: true, tiff: true })
    const rawBearing = exif?.GPSImgDirection ?? null
    return {
      lat:       exif?.latitude          ?? null,
      lng:       exif?.longitude         ?? null,
      timestamp: exif?.DateTimeOriginal  ?? exif?.CreateDate ?? null,
      bearing:   rawBearing != null ? Math.round(rawBearing) : null,
    }
  } catch {
    return { lat: null, lng: null, timestamp: null, bearing: null }
  }
}

export default function ObservationModal({ propertyId, operations, tagTypes = [], onSaved, onCancel }) {
  const [photos,      setPhotos]      = useState([])
  const [batchOpId,   setBatchOpId]   = useState('')
  const [batchTagIds, setBatchTagIds] = useState([])
  const [uploading,   setUploading]   = useState(false)
  const [dragOver,    setDragOver]    = useState(false)
  const fileInputRef = useRef(null)

  const toggleBatchTag = (id) =>
    setBatchTagIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])

  // ── Add files (from drop or file picker) ──────────────────────────
  const addFiles = useCallback((fileList) => {
    const incoming = Array.from(fileList).filter((f) => f.type.startsWith('image/'))
    if (!incoming.length) return

    const newPhotos = incoming.map((file) => ({
      id:           ++_nextId,
      file,
      preview:      URL.createObjectURL(file),
      exifStatus:   'loading',  // loading | done
      lat: null, lng: null, timestamp: null, bearing: null,
      imageHash:    null,       // SHA-256 hex, set after hashing
      dupStatus:    null,       // null | 'checking' | 'duplicate' | 'clear'
      dupDecision:  null,       // null | 'skip' | 'force'
      notes:        '',
      uploadStatus: 'pending',  // pending | uploading | done | skipped | error
      errorMsg:     null,
    }))

    setPhotos((prev) => [...prev, ...newPhotos])

    // Parse EXIF and hash file concurrently
    newPhotos.forEach((photo) => {
      readExif(photo.file).then((exif) => {
        setPhotos((prev) =>
          prev.map((p) => p.id === photo.id ? { ...p, ...exif, exifStatus: 'done' } : p)
        )
      })
      api.hashFile(photo.file).then((hash) => {
        setPhotos((prev) =>
          prev.map((p) => p.id === photo.id ? { ...p, imageHash: hash } : p)
        )
      }).catch(() => {}) // hash failure is non-fatal — duplicate check skipped
    })
  }, [])

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    addFiles(e.dataTransfer.files)
  }

  const removePhoto = (id) => setPhotos((prev) => prev.filter((p) => p.id !== id))

  const updatePhoto = (id, updates) =>
    setPhotos((prev) => prev.map((p) => p.id === id ? { ...p, ...updates } : p))

  // ── Upload all pending photos (two-phase: check duplicates then upload) ──────
  const handleUploadAll = async () => {
    const pending = photos.filter((p) => p.uploadStatus === 'pending')
    if (!pending.length) return
    setUploading(true)

    // Phase 1: duplicate check — only for photos with a hash not yet checked
    const unchecked = pending.filter((p) => p.imageHash && p.dupStatus === null)
    if (unchecked.length > 0) {
      setPhotos((prev) =>
        prev.map((p) => unchecked.find((u) => u.id === p.id) ? { ...p, dupStatus: 'checking' } : p)
      )
      let hasDuplicates = false
      await Promise.all(
        unchecked.map(async (photo) => {
          try {
            const dup = await api.findDuplicateObservation(propertyId, photo.imageHash)
            if (dup) hasDuplicates = true
            setPhotos((prev) =>
              prev.map((p) => p.id === photo.id ? { ...p, dupStatus: dup ? 'duplicate' : 'clear' } : p)
            )
          } catch {
            setPhotos((prev) =>
              prev.map((p) => p.id === photo.id ? { ...p, dupStatus: 'clear' } : p)
            )
          }
        })
      )
      setUploading(false)
      if (hasDuplicates) return  // show duplicate cards — user resolves then clicks again
    } else {
      setUploading(false)
    }

    // Recompute from current state snapshot to pick up resolved decisions
    setPhotos((current) => {
      const toUpload = current.filter(
        (p) => p.uploadStatus === 'pending' && p.dupDecision !== 'skip'
      )
      const toSkip = current.filter(
        (p) => p.uploadStatus === 'pending' && p.dupDecision === 'skip'
      )
      // Mark skipped immediately
      const afterSkip = current.map((p) =>
        toSkip.find((s) => s.id === p.id) ? { ...p, uploadStatus: 'skipped' } : p
      )

      // Kick off upload outside of this setState callback
      setTimeout(() => doUpload(toUpload), 0)
      return afterSkip
    })
  }

  const doUpload = async (toUpload) => {
    if (!toUpload.length) {
      setPhotos((current) => {
        if (current.every((p) => ['done', 'skipped'].includes(p.uploadStatus))) {
          setTimeout(onSaved, 400)
        }
        return current
      })
      return
    }
    setUploading(true)
    for (const photo of toUpload) {
      updatePhoto(photo.id, { uploadStatus: 'uploading' })
      try {
        const imageUrl = await api.uploadObservationImage(photo.file)
        const geom = (photo.lat != null && photo.lng != null)
          ? { type: 'Point', coordinates: [photo.lng, photo.lat] }
          : null
        const obsId = await api.createObservation({
          propertyId,
          operationId: batchOpId || null,
          geom,
          observedAt:  photo.timestamp
            ? new Date(photo.timestamp).toISOString()
            : new Date().toISOString(),
          type:        null,
          notes:       photo.notes.trim() || null,
          imageUrl,
          bearing:     photo.bearing ?? null,
          imageHash:   photo.imageHash || null,
        })
        if (obsId && batchTagIds.length > 0) {
          await Promise.all(
            batchTagIds.map((tId) => api.addObservationTag(obsId, tId).catch(() => {}))
          )
        }
        updatePhoto(photo.id, { uploadStatus: 'done' })
      } catch (err) {
        const isDup = err.message?.includes('duplicate key') || err.code === '23505'
        updatePhoto(photo.id, {
          uploadStatus: 'error',
          errorMsg: isDup ? 'Duplicate image already exists' : err.message,
        })
      }
    }
    setUploading(false)
    setPhotos((current) => {
      if (current.every((p) => ['done', 'skipped'].includes(p.uploadStatus))) {
        setTimeout(onSaved, 400)
      }
      return current
    })
  }

  const doneCount       = photos.filter((p) => p.uploadStatus === 'done').length
  const unresolvedDups  = photos.filter((p) => p.uploadStatus === 'pending' && p.dupStatus === 'duplicate' && p.dupDecision === null)
  const willUploadCount = photos.filter((p) => p.uploadStatus === 'pending' && p.dupDecision !== 'skip').length
  const pendingCount    = photos.filter((p) => p.uploadStatus === 'pending').length
  const hasErrors       = photos.some((p) => p.uploadStatus === 'error')

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>

        {/* Header */}
        <div style={styles.header}>
          <div>
            <span style={styles.badge}>📷 OBSERVATIONS</span>
            <div style={styles.title}>Add Photos</div>
          </div>
          <button style={styles.closeBtn} onClick={onCancel} disabled={uploading}>✕</button>
        </div>

        {/* Batch settings */}
        <div style={styles.batchRow}>
          {operations?.length > 0 && (
            <label style={styles.batchLabel}>
              Link to event <span style={styles.optional}>(optional)</span>
              <select style={styles.batchSelect} value={batchOpId} onChange={(e) => setBatchOpId(e.target.value)}>
                <option value="">— None —</option>
                {operations.map((op) => <option key={op.id} value={op.id}>{op.name}</option>)}
              </select>
            </label>
          )}
        </div>

        {/* Tag selection */}
        {tagTypes.length > 0 && (
          <div style={styles.tagSection}>
            <span style={styles.tagSectionLabel}>Tags</span>
            <div style={styles.tagChips}>
              {tagTypes.map((tt) => (
                <button
                  key={tt.id}
                  style={{
                    ...styles.tagChip,
                    ...(batchTagIds.includes(tt.id)
                      ? { borderColor: tt.color, color: tt.color, background: tt.color + '18' }
                      : {}),
                  }}
                  onClick={() => toggleBatchTag(tt.id)}
                >
                  {tt.emoji} {tt.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Drop zone */}
        <div
          style={{
            ...styles.dropzone,
            borderColor: dragOver ? C.burntOrange : 'rgba(0,0,0,0.12)',
            background:  dragOver ? C.burntOrange + '08' : 'transparent',
          }}
          onClick={() => !uploading && fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragEnter={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <span style={styles.dropIcon}>{dragOver ? '📂' : '📷'}</span>
          <span style={styles.dropText}>
            {photos.length
              ? `${photos.length} photo${photos.length !== 1 ? 's' : ''} queued — drop more or click to add`
              : 'Drop photos here, or click to select'}
          </span>
          <span style={styles.dropSub}>
            GPS coordinates, timestamps &amp; compass bearing extracted automatically from EXIF
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => addFiles(e.target.files)}
          />
        </div>

        {/* Photo grid */}
        {photos.length > 0 && (
          <div style={styles.grid}>
            {photos.map((photo) => (
              <PhotoCard
                key={photo.id}
                photo={photo}
                onRemove={() => removePhoto(photo.id)}
                onNotes={(v) => updatePhoto(photo.id, { notes: v })}
                onDupDecision={(decision) => updatePhoto(photo.id, { dupDecision: decision })}
              />
            ))}
          </div>
        )}

        {/* Progress summary */}
        {uploading && (
          <div style={styles.progress}>
            <div style={{ ...styles.progressBar, width: `${(doneCount / photos.length) * 100}%` }} />
            <span style={styles.progressText}>
              Saving {doneCount} of {photos.length}…
            </span>
          </div>
        )}

        {hasErrors && !uploading && (
          <div style={styles.errorNote}>
            Some photos failed — fix the errors and click Retry.
          </div>
        )}

        {/* Actions */}
        <div style={styles.actions}>
          <button style={styles.cancelBtn} onClick={onCancel} disabled={uploading}>
            Cancel
          </button>
          <button
            style={{
              ...styles.saveBtn,
              ...(unresolvedDups.length > 0 ? { background: '#b45309' } : {}),
              opacity: (!pendingCount || uploading) ? 0.45 : 1,
            }}
            onClick={handleUploadAll}
            disabled={!pendingCount || uploading || unresolvedDups.length > 0}
          >
            {uploading
              ? `Checking / Uploading…`
              : unresolvedDups.length > 0
              ? `Resolve ${unresolvedDups.length} duplicate${unresolvedDups.length !== 1 ? 's' : ''} above`
              : hasErrors
              ? `Retry ${pendingCount} Failed`
              : `Upload ${willUploadCount} Photo${willUploadCount !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Individual photo card ─────────────────────────────────────────────────────
function PhotoCard({ photo, onRemove, onNotes, onDupDecision }) {
  const borderColor =
    photo.uploadStatus === 'done'      ? C.pistachioGreen :
    photo.uploadStatus === 'uploading' ? C.dryGrassYellow :
    photo.uploadStatus === 'error'     ? T.danger :
    photo.uploadStatus === 'skipped'   ? 'rgba(0,0,0,0.12)' :
    photo.dupStatus    === 'duplicate' ? '#b45309' :
    photo.dupStatus    === 'checking'  ? C.dryGrassYellow :
    T.surfaceBorder

  return (
    <div style={{ ...styles.card, borderColor, opacity: photo.uploadStatus === 'skipped' ? 0.45 : 1 }}>
      {/* Remove button */}
      {photo.uploadStatus === 'pending' && photo.dupStatus !== 'checking' && (
        <button style={styles.cardRemove} onClick={onRemove} title="Remove">✕</button>
      )}

      {/* Thumbnail */}
      <img src={photo.preview} style={styles.thumb} alt="" />

      {/* Upload / hash-check status overlay */}
      {photo.uploadStatus !== 'pending' && (
        <div style={{
          ...styles.statusBar,
          background:
            photo.uploadStatus === 'done'      ? C.deepOlive + 'e6'  :
            photo.uploadStatus === 'uploading' ? C.dryGrassYellow + 'e6' :
            photo.uploadStatus === 'skipped'   ? 'rgba(80,80,80,0.82)' :
            T.danger + 'e6',
        }}>
          {photo.uploadStatus === 'uploading' ? '⏳ Uploading…' :
           photo.uploadStatus === 'done'      ? '✓ Saved'       :
           photo.uploadStatus === 'skipped'   ? 'Skipped'       :
           `✕ ${photo.errorMsg ?? 'Error'}`}
        </div>
      )}

      {/* Duplicate checking spinner */}
      {photo.dupStatus === 'checking' && (
        <div style={{ ...styles.statusBar, background: '#92400ee6' }}>
          🔍 Checking…
        </div>
      )}

      {/* Duplicate warning + decision */}
      {photo.dupStatus === 'duplicate' && photo.dupDecision === null && (
        <div style={styles.dupBanner}>
          <div style={styles.dupMsg}>Already uploaded</div>
          <div style={styles.dupActions}>
            <button style={styles.dupSkipBtn} onClick={() => onDupDecision('skip')}>Skip</button>
            <button style={styles.dupForceBtn} onClick={() => onDupDecision('force')}>Upload Anyway</button>
          </div>
        </div>
      )}

      {/* Forced-duplicate indicator */}
      {photo.dupDecision === 'force' && photo.uploadStatus === 'pending' && (
        <div style={{ ...styles.statusBar, background: '#92400ee6' }}>
          Will upload anyway
        </div>
      )}

      {/* EXIF info */}
      <div style={styles.cardInfo}>
        <div style={styles.cardFilename} title={photo.file.name}>
          {photo.file.name.length > 22 ? photo.file.name.slice(0, 19) + '…' : photo.file.name}
        </div>
        {photo.exifStatus === 'loading' ? (
          <span style={styles.gpsChip}>Reading…</span>
        ) : photo.lat != null ? (
          <div style={styles.exifRow}>
            <span style={{ ...styles.gpsChip, color: C.deepOlive, background: T.brandBg }}>
              📍 GPS
            </span>
            {photo.bearing != null && (
              <span style={{ ...styles.gpsChip, color: C.dustyBlue, background: C.dustyBlue + '14' }}>
                ↗ {bearingToCardinal(photo.bearing)}
              </span>
            )}
          </div>
        ) : (
          <span style={{ ...styles.gpsChip, color: '#b45309', background: 'rgba(180,83,9,0.08)' }}>
            ⚠ No GPS
          </span>
        )}
        {photo.uploadStatus === 'pending' && (
          <textarea
            style={styles.cardNotes}
            placeholder="Notes…"
            value={photo.notes}
            rows={2}
            onChange={(e) => onNotes(e.target.value)}
          />
        )}
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = {
  overlay: {
    position:       'fixed',
    inset:          0,
    zIndex:         30,
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    background:     'rgba(0,0,0,0.4)',
    backdropFilter: 'blur(4px)',
  },
  modal: {
    background:   T.surface,
    borderTop:    `3px solid ${C.burntOrange}`,
    borderRadius: 14,
    padding:      24,
    width:        600,
    maxWidth:     '96vw',
    maxHeight:    '92vh',
    overflowY:    'auto',
    boxShadow:    '0 8px 40px rgba(47,47,47,0.18)',
    display:      'flex',
    flexDirection: 'column',
    gap:          16,
  },
  header: {
    display:        'flex',
    alignItems:     'flex-start',
    justifyContent: 'space-between',
  },
  badge: {
    display:      'inline-block',
    fontSize:     10,
    fontWeight:   700,
    letterSpacing: '0.1em',
    border:       `1px solid ${C.burntOrange}50`,
    borderRadius: 4,
    padding:      '2px 7px',
    color:        C.burntOrange,
    marginBottom: 6,
  },
  title: {
    fontSize:   18,
    fontWeight: 700,
    color:      T.text,
  },
  closeBtn: {
    background: 'transparent',
    border:     'none',
    color:      T.textFaint,
    fontSize:   16,
    cursor:     'pointer',
    padding:    4,
    lineHeight: 1,
  },
  batchRow: {
    display: 'flex',
    gap:     12,
    flexWrap: 'wrap',
  },
  batchLabel: {
    flex:          1,
    minWidth:      160,
    display:       'flex',
    flexDirection: 'column',
    gap:           5,
    color:         T.textMuted,
    fontSize:      11,
    fontWeight:    600,
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
  },
  optional: {
    fontWeight:    400,
    textTransform: 'none',
    letterSpacing: 0,
    color:         T.textFaint,
  },
  batchSelect: {
    background:   T.surfaceBorder,
    border:       `1px solid ${T.surfaceBorder}`,
    borderRadius: 6,
    color:        T.text,
    fontSize:     13,
    padding:      '7px 10px',
    fontFamily:   'inherit',
  },
  tagSection: {
    display:       'flex',
    flexDirection: 'column',
    gap:           7,
  },
  tagSectionLabel: {
    color:         T.textMuted,
    fontSize:      11,
    fontWeight:    600,
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
  },
  tagChips: {
    display:  'flex',
    flexWrap: 'wrap',
    gap:      5,
  },
  tagChip: {
    display:       'inline-flex',
    alignItems:    'center',
    padding:       '4px 10px',
    borderRadius:  20,
    borderWidth:   1,
    borderStyle:   'solid',
    borderColor:   T.surfaceBorder,
    background:    'transparent',
    color:         T.textMuted,
    fontSize:      12,
    fontWeight:    500,
    cursor:        'pointer',
    transition:    'all 0.12s',
    fontFamily:    'inherit',
  },
  dropzone: {
    border:         '2px dashed',
    borderRadius:   10,
    padding:        '22px 16px',
    textAlign:      'center',
    cursor:         'pointer',
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    gap:            5,
    transition:     'all 0.15s',
  },
  dropIcon: {
    fontSize:   26,
    lineHeight: 1,
  },
  dropText: {
    color:      T.text,
    fontSize:   14,
    fontWeight: 500,
  },
  dropSub: {
    color:    'rgba(0,0,0,0.4)',
    fontSize: 12,
  },
  grid: {
    display:             'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap:                 10,
  },
  card: {
    border:       '1.5px solid',
    borderRadius: 9,
    overflow:     'hidden',
    position:     'relative',
    background:   T.surfaceBorder,
    display:      'flex',
    flexDirection: 'column',
  },
  cardRemove: {
    position:   'absolute',
    top:        5,
    right:      5,
    zIndex:     2,
    background: 'rgba(0,0,0,0.55)',
    border:     'none',
    borderRadius: '50%',
    color:      '#fff',
    width:      20,
    height:     20,
    fontSize:   9,
    cursor:     'pointer',
    display:    'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
    padding:    0,
  },
  thumb: {
    width:      '100%',
    height:     110,
    objectFit:  'cover',
    display:    'block',
  },
  statusBar: {
    position:   'absolute',
    top:        0,
    left:       0,
    right:      0,
    padding:    '4px 8px',
    color:      '#fff',
    fontSize:   11,
    fontWeight: 600,
    textAlign:  'center',
  },
  cardInfo: {
    padding:       '7px 8px',
    display:       'flex',
    flexDirection: 'column',
    gap:           4,
  },
  cardFilename: {
    fontSize:  11,
    color:     T.textMuted,
    fontWeight: 500,
  },
  exifRow: {
    display: 'flex',
    gap:     4,
    flexWrap: 'wrap',
  },
  gpsChip: {
    fontSize:    10,
    fontWeight:  600,
    padding:     '2px 6px',
    borderRadius: 4,
    background:  'rgba(0,0,0,0.05)',
    color:       'rgba(0,0,0,0.4)',
    alignSelf:   'flex-start',
  },
  dupBanner: {
    position:        'absolute',
    top:             0,
    left:            0,
    right:           0,
    background:      'rgba(180,83,9,0.93)',
    padding:         '6px 8px',
    display:         'flex',
    flexDirection:   'column',
    gap:             5,
    zIndex:          3,
  },
  dupMsg: {
    color:      '#fff',
    fontSize:   10,
    fontWeight: 700,
    textAlign:  'center',
  },
  dupActions: {
    display: 'flex',
    gap:     4,
  },
  dupSkipBtn: {
    flex:         1,
    background:   'rgba(255,255,255,0.18)',
    border:       '1px solid rgba(255,255,255,0.4)',
    borderRadius: 4,
    color:        '#fff',
    fontSize:     10,
    fontWeight:   700,
    padding:      '4px 0',
    cursor:       'pointer',
    fontFamily:   'inherit',
  },
  dupForceBtn: {
    flex:         1,
    background:   'rgba(255,255,255,0.9)',
    border:       'none',
    borderRadius: 4,
    color:        '#92400e',
    fontSize:     10,
    fontWeight:   700,
    padding:      '4px 0',
    cursor:       'pointer',
    fontFamily:   'inherit',
  },
  cardNotes: {
    background:   T.surface,
    border:       `1px solid ${T.surfaceBorder}`,
    borderRadius: 5,
    color:        T.text,
    fontSize:     11,
    padding:      '5px 7px',
    resize:       'none',
    fontFamily:   'inherit',
    marginTop:    2,
  },
  progress: {
    position:   'relative',
    height:     24,
    background: 'rgba(0,0,0,0.05)',
    borderRadius: 6,
    overflow:   'hidden',
    display:    'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressBar: {
    position:   'absolute',
    left:       0,
    top:        0,
    bottom:     0,
    background: T.brand,
    transition: 'width 0.3s ease',
  },
  progressText: {
    position:   'relative',
    fontSize:   11,
    fontWeight: 600,
    color:      T.text,
    zIndex:     1,
  },
  errorNote: {
    background:   T.dangerBg,
    border:       `1px solid ${T.dangerBorder}`,
    borderRadius: 6,
    color:        T.danger,
    fontSize:     12,
    padding:      '8px 12px',
    textAlign:    'center',
  },
  actions: {
    display: 'flex',
    gap:     10,
  },
  cancelBtn: {
    flex:       1,
    background: 'transparent',
    border:     `1px solid ${T.surfaceBorder}`,
    borderRadius: 7,
    color:      T.textMuted,
    fontSize:   13,
    padding:    '10px 0',
    cursor:     'pointer',
    fontFamily: 'inherit',
  },
  saveBtn: {
    flex:       2,
    background: C.burntOrange,
    border:     'none',
    borderRadius: 7,
    color:      T.textOnDark,
    fontSize:   13,
    fontWeight: 700,
    padding:    '10px 0',
    cursor:     'pointer',
    fontFamily: 'inherit',
  },
}
