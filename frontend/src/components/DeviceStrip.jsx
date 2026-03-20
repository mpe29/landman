import { useRef, useEffect, useState, useMemo } from 'react'
import { C } from '../constants/theme'
import { api } from '../api'

// Reuse ImageStrip dimensions exactly
const THUMB_W = 180
const THUMB_H = 120
const GAP = 8
const ITEM_W = THUMB_W + GAP
const PAD = 16

// Category sort order — routing first, then trackers, sensors, other last
const CATEGORY_ORDER = {
  routing: 0,
  gps_tracker: 1,
  environment: 2,
  water_level: 3,
  door_sensor: 4,
  other: 5,
}

function timeAgo(ts) {
  if (!ts) return '—'
  const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000)
  if (mins < 1)   return 'now'
  if (mins < 60)  return `${mins}m`
  const hrs = Math.round(mins / 60)
  if (hrs < 24)   return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

function batteryColor(pct) {
  if (pct == null) return '#888'
  if (pct > 50) return '#22c55e'
  if (pct > 20) return '#f59e0b'
  return '#ef4444'
}

/**
 * Bottom-docked horizontal device strip — matching ImageStrip's exact sizing.
 * Renders device thumbnails grouped by category, with metadata overlays.
 */
export default function DeviceStrip({
  devices,
  selectedDeviceId,
  onSelect,
  onHover,
  trailDeviceIds,
  onToggleTrail,
}) {
  const scrollRef = useRef(null)
  const [hoveredId, setHoveredId] = useState(null)

  // Sort: by category order, then name
  const sorted = useMemo(() => {
    if (!devices?.length) return []
    return [...devices].sort((a, b) => {
      const catA = CATEGORY_ORDER[a.device_types?.category] ?? 5
      const catB = CATEGORY_ORDER[b.device_types?.category] ?? 5
      if (catA !== catB) return catA - catB
      return (a.name || '').localeCompare(b.name || '')
    })
  }, [devices])

  // Auto-scroll to selected device
  useEffect(() => {
    if (!selectedDeviceId || !scrollRef.current) return
    const idx = sorted.findIndex((d) => d.id === selectedDeviceId)
    if (idx < 0) return
    const containerW = scrollRef.current.clientWidth
    const targetLeft = PAD + idx * ITEM_W - (containerW / 2) + (THUMB_W / 2)
    scrollRef.current.scrollTo({ left: targetLeft, behavior: 'smooth' })
  }, [selectedDeviceId, sorted])

  if (sorted.length === 0) return null

  return (
    <div
      ref={scrollRef}
      className="image-strip-scroll"
      style={s.scroll}
    >
      <div style={{ display: 'flex', gap: GAP, padding: `0 ${PAD}px`, height: THUMB_H }}>
        {sorted.map((device) => {
          const isSelected = device.id === selectedDeviceId
          const isHovered = device.id === hoveredId
          const hasTrail = trailDeviceIds?.has?.(device.id)
          const thumbUrl = api.getDeviceThumbUrl(device)
          const icon = device.device_types?.icon || '📦'
          const eui = device.dev_eui?.slice(-4)?.toUpperCase() || '—'

          return (
            <div
              key={device.id}
              style={{
                ...s.card,
                ...(isSelected ? s.cardSelected : {}),
                ...(isHovered && !isSelected ? s.cardHover : {}),
              }}
              onClick={() => onSelect?.(device)}
              onMouseEnter={(e) => {
                setHoveredId(device.id)
                const rect = e.currentTarget.getBoundingClientRect()
                onHover?.({
                  device,
                  x: rect.left + rect.width / 2,
                  y: rect.top,
                })
              }}
              onMouseLeave={() => { setHoveredId(null); onHover?.(null) }}
            >
              {/* Background: custom image or emoji icon on gradient */}
              {thumbUrl ? (
                <img src={thumbUrl} alt="" style={s.bgImg} loading="lazy" />
              ) : (
                <div style={s.emojiCard}>
                  <span style={s.emojiIcon}>{icon}</span>
                </div>
              )}

              {/* Top overlay: trail toggle (left) + battery (right) */}
              <div style={s.topOverlay}>
                <button
                  style={{
                    ...s.trailBtn,
                    background: hasTrail ? 'rgba(34,197,94,0.7)' : 'rgba(0,0,0,0.4)',
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleTrail?.(device.id)
                  }}
                  title={hasTrail ? 'Hide trail' : 'Show trail'}
                >
                  ◉
                </button>
                {device.last_battery_pct != null && (
                  <div style={s.battery}>
                    <div style={{
                      ...s.batteryBar,
                      width: `${Math.min(device.last_battery_pct, 100)}%`,
                      background: batteryColor(device.last_battery_pct),
                    }} />
                    <span style={s.batteryText}>{device.last_battery_pct}%</span>
                  </div>
                )}
              </div>

              {/* Bottom overlay: name + EUI + time ago */}
              <div style={s.bottomOverlay}>
                <div style={s.deviceName}>{device.name}</div>
                <div style={s.metaRow}>
                  <span style={s.eui}>{eui}</span>
                  <span style={s.ago}>{timeAgo(device.last_seen_at)}</span>
                </div>
              </div>

              {isSelected && <div style={s.selectedBorder} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const s = {
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
  card: {
    width: THUMB_W,
    height: THUMB_H,
    borderRadius: 8,
    overflow: 'hidden',
    cursor: 'pointer',
    transition: 'transform 0.15s, box-shadow 0.15s',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    position: 'relative',
    flexShrink: 0,
  },
  cardSelected: {
    transform: 'scale(1.05)',
    boxShadow: `0 0 0 2px ${C.pistachioGreen}, 0 4px 16px rgba(0,0,0,0.4)`,
    zIndex: 1,
  },
  cardHover: {
    transform: 'scale(1.03)',
    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
    zIndex: 1,
  },
  bgImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
    userSelect: 'none',
    pointerEvents: 'none',
  },
  emojiCard: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #2d3a2e 0%, #1a2520 100%)',
  },
  emojiIcon: {
    fontSize: 36,
    userSelect: 'none',
    pointerEvents: 'none',
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 5,
    pointerEvents: 'none',
  },
  trailBtn: {
    pointerEvents: 'auto',
    width: 20,
    height: 20,
    borderRadius: 10,
    border: 'none',
    color: '#fff',
    fontSize: 10,
    lineHeight: '20px',
    textAlign: 'center',
    cursor: 'pointer',
    padding: 0,
    fontFamily: 'inherit',
    transition: 'background 0.15s',
  },
  battery: {
    position: 'relative',
    width: 34,
    height: 14,
    background: 'rgba(0,0,0,0.5)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  batteryBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    borderRadius: 3,
    transition: 'width 0.3s',
  },
  batteryText: {
    position: 'relative',
    zIndex: 1,
    fontSize: 8,
    fontWeight: 700,
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    letterSpacing: '0.02em',
  },
  bottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
    padding: '16px 7px 5px',
  },
  deviceName: {
    fontSize: 11,
    fontWeight: 600,
    color: '#fff',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    lineHeight: 1.2,
  },
  metaRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  eui: {
    fontSize: 9,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.6)',
    fontFamily: 'monospace',
    letterSpacing: '0.05em',
  },
  ago: {
    fontSize: 9,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.6)',
  },
  selectedBorder: {
    position: 'absolute',
    inset: 0,
    borderRadius: 8,
    border: `2px solid ${C.pistachioGreen}`,
    pointerEvents: 'none',
  },
}
