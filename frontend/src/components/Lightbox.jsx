import { useEffect, useCallback } from 'react'
import { T, C } from '../constants/theme'

/**
 * Full-screen image lightbox with left/right navigation.
 * Shows observation image, date, bearing, and allows keyboard nav.
 */
export default function Lightbox({ observation, observations, onClose, onNavigate }) {
  const idx = observations.findIndex((o) => o.id === observation.id)

  const goPrev = useCallback(() => {
    if (idx > 0) onNavigate(observations[idx - 1])
  }, [idx, observations, onNavigate])

  const goNext = useCallback(() => {
    if (idx < observations.length - 1) onNavigate(observations[idx + 1])
  }, [idx, observations, onNavigate])

  // Keyboard navigation
  useEffect(() => {
    const handle = (e) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') goPrev()
      else if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [onClose, goPrev, goNext])

  const date = observation.observed_at
    ? new Date(observation.observed_at).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
    : ''

  const bearingStr = observation.bearing != null
    ? `${bearingToCardinal(observation.bearing)} ${observation.bearing}°`
    : ''

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.content} onClick={(e) => e.stopPropagation()}>
        {/* Close button */}
        <button style={s.closeBtn} onClick={onClose}>✕</button>

        {/* Navigation arrows */}
        {idx > 0 && (
          <button style={{ ...s.navBtn, left: 16 }} onClick={goPrev}>‹</button>
        )}
        {idx < observations.length - 1 && (
          <button style={{ ...s.navBtn, right: 16 }} onClick={goNext}>›</button>
        )}

        {/* Image */}
        <img
          src={observation.image_url}
          alt="Observation"
          style={s.img}
        />

        {/* Info bar */}
        <div style={s.infoBar}>
          <span style={s.infoDate}>{date}</span>
          {bearingStr && <span style={s.infoBearing}>{bearingStr}</span>}
          <span style={s.infoCount}>{idx + 1} / {observations.length}</span>
        </div>
      </div>
    </div>
  )
}

function bearingToCardinal(deg) {
  const dirs = ['N','NE','E','SE','S','SW','W','NW']
  return dirs[Math.round(deg / 45) % 8]
}

const s = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 100,
    background: 'rgba(0,0,0,0.88)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  content: {
    position: 'relative',
    maxWidth: '90vw',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    cursor: 'default',
  },
  closeBtn: {
    position: 'absolute',
    top: -40,
    right: 0,
    background: 'none',
    border: 'none',
    color: 'rgba(255,255,255,0.8)',
    fontSize: 24,
    cursor: 'pointer',
    padding: '4px 8px',
    zIndex: 2,
  },
  navBtn: {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'rgba(0,0,0,0.5)',
    border: 'none',
    color: '#fff',
    fontSize: 36,
    width: 48,
    height: 48,
    borderRadius: '50%',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    transition: 'background 0.15s',
  },
  img: {
    maxWidth: '90vw',
    maxHeight: 'calc(90vh - 50px)',
    objectFit: 'contain',
    borderRadius: 6,
    userSelect: 'none',
  },
  infoBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    marginTop: 10,
    padding: '6px 16px',
    background: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
  },
  infoDate: {
    fontSize: 13,
    fontWeight: 600,
    color: '#fff',
  },
  infoBearing: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  infoCount: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginLeft: 'auto',
  },
}
