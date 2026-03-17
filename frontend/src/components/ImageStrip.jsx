import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { T, C } from '../constants/theme'
import { thumbUrl } from '../utils/thumbUrl'

// Hide scrollbar (CSS-in-JS can't target ::-webkit-scrollbar)
let stripCssInjected = false
function injectStripCss() {
  if (stripCssInjected) return
  stripCssInjected = true
  const style = document.createElement('style')
  style.textContent = `.image-strip-scroll::-webkit-scrollbar { display: none; }`
  document.head.appendChild(style)
}

const STRIP_HEIGHT = 160
const COLLAPSED_H = 28
const THUMB_W = 180
const THUMB_H = 120
const GAP = 8
const ITEM_W = THUMB_W + GAP
const PAD = 16

/**
 * Bottom-docked horizontal image strip — Google Maps-style.
 * Renders viewport-filtered thumbnails (typically 10–30 at a time).
 * Sorted newest-right, scrollable left for older images.
 */
export default function ImageStrip({ observations, selectedObsId, onSelect, onImageClick, collapsed, onToggleCollapse, onHover }) {
  const scrollRef = useRef(null)
  useEffect(() => { injectStripCss() }, [])
  const [hoveredId, setHoveredId] = useState(null)

  // Only observations with images, sorted oldest→newest (newest on right)
  const withImages = useMemo(() =>
    observations
      .filter((o) => o.image_url)
      .sort((a, b) => new Date(a.observed_at) - new Date(b.observed_at)),
    [observations]
  )

  // Auto-scroll to selected thumbnail
  useEffect(() => {
    if (!selectedObsId || !scrollRef.current || collapsed) return
    const idx = withImages.findIndex((o) => o.id === selectedObsId)
    if (idx < 0) return
    const containerW = scrollRef.current.clientWidth
    const targetLeft = PAD + idx * ITEM_W - (containerW / 2) + (THUMB_W / 2)
    scrollRef.current.scrollTo({ left: targetLeft, behavior: 'smooth' })
  }, [selectedObsId, collapsed, withImages])

  if (withImages.length === 0) return null

  return (
    <div style={{ ...s.wrap, height: collapsed ? COLLAPSED_H : STRIP_HEIGHT }}>
      {/* Toggle tab */}
      <button style={s.toggleBtn} onClick={onToggleCollapse}>
        <span style={s.toggleIcon}>{collapsed ? '▴' : '▾'}</span>
        <span style={s.toggleLabel}>
          {withImages.length} photo{withImages.length !== 1 ? 's' : ''}
        </span>
      </button>

      {/* Scrollable thumbnail row */}
      {!collapsed && (
        <div
          ref={scrollRef}
          className="image-strip-scroll"
          style={s.scroll}
        >
          <div style={{ display: 'flex', gap: GAP, padding: `0 ${PAD}px`, height: THUMB_H }}>
            {withImages.map((obs) => {
              const isSelected = obs.id === selectedObsId
              const isHovered = obs.id === hoveredId
              const date = new Date(obs.observed_at)
              const dateStr = date.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: '2-digit' })

              return (
                <div
                  key={obs.id}
                  data-obs-id={obs.id}
                  style={{
                    ...s.thumb,
                    flexShrink: 0,
                    ...(isSelected ? s.thumbSelected : {}),
                    ...(isHovered && !isSelected ? s.thumbHover : {}),
                  }}
                  onClick={() => {
                    onSelect(obs)
                    onImageClick(obs)
                  }}
                  onMouseEnter={(e) => {
                    setHoveredId(obs.id)
                    const rect = e.currentTarget.getBoundingClientRect()
                    onHover?.({ obs, x: rect.left + rect.width / 2, y: rect.top })
                  }}
                  onMouseLeave={() => { setHoveredId(null); onHover?.(null) }}
                >
                  <img
                    src={thumbUrl(obs.image_url)}
                    onError={(e) => { if (e.target.src !== obs.image_url) e.target.src = obs.image_url }}
                    alt="" style={s.img} loading="lazy"
                  />
                  <div style={s.dateBadge}>{dateStr}</div>
                  {isSelected && <div style={s.selectedBorder} />}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

const s = {
  wrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 12,
    background: 'linear-gradient(to top, rgba(47,47,47,0.85) 0%, rgba(47,47,47,0.65) 70%, transparent 100%)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    paddingBottom: 10,
    pointerEvents: 'none',
    transition: 'height 0.2s ease',
  },
  toggleBtn: {
    pointerEvents: 'auto',
    alignSelf: 'flex-end',
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    marginRight: 16,
    marginBottom: 4,
    padding: '3px 10px',
    background: 'rgba(47,47,47,0.6)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 12,
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  toggleIcon: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 1,
  },
  toggleLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: '0.04em',
  },
  scroll: {
    pointerEvents: 'auto',
    height: THUMB_H,
    flexShrink: 0,
    overflowX: 'auto',
    overflowY: 'hidden',
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
    WebkitOverflowScrolling: 'touch',
  },
  thumb: {
    width: THUMB_W,
    height: THUMB_H,
    borderRadius: 8,
    overflow: 'hidden',
    cursor: 'pointer',
    transition: 'transform 0.15s, box-shadow 0.15s',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    position: 'relative',
  },
  thumbSelected: {
    transform: 'scale(1.05)',
    boxShadow: `0 0 0 2px ${C.burntOrange}, 0 4px 16px rgba(0,0,0,0.4)`,
    zIndex: 1,
  },
  thumbHover: {
    transform: 'scale(1.03)',
    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
    zIndex: 1,
  },
  img: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
    userSelect: 'none',
    pointerEvents: 'none',
  },
  dateBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    fontSize: 10,
    fontWeight: 600,
    color: '#fff',
    background: 'rgba(0,0,0,0.55)',
    borderRadius: 4,
    padding: '2px 6px',
    letterSpacing: '0.03em',
    pointerEvents: 'none',
  },
  selectedBorder: {
    position: 'absolute',
    inset: 0,
    borderRadius: 8,
    border: `2px solid ${C.burntOrange}`,
    pointerEvents: 'none',
  },
}

export { STRIP_HEIGHT, COLLAPSED_H }
