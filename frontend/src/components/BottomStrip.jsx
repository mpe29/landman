import ImageStrip, { STRIP_HEIGHT, COLLAPSED_H } from './ImageStrip'
import DeviceStrip from './DeviceStrip'

/**
 * Shared bottom-docked strip container with 3-way toggle:
 * photos → devices → hidden → photos
 */
export default function BottomStrip({
  mode,          // 'photos' | 'devices' | 'hidden'
  onToggleMode,
  // ImageStrip props
  observations,
  selectedObsId,
  onSelectObs,
  onImageClick,
  onHoverObs,
  // DeviceStrip props
  devices,
  selectedDeviceId,
  onSelectDevice,
  onHoverDevice,
  trailDeviceIds,
  onToggleTrail,
}) {
  const collapsed = mode === 'hidden'
  const photoCount = observations?.filter((o) => o.image_url)?.length || 0
  const deviceCount = devices?.length || 0

  const toggleLabel =
    mode === 'photos'  ? `${photoCount} photo${photoCount !== 1 ? 's' : ''}` :
    mode === 'devices' ? `${deviceCount} device${deviceCount !== 1 ? 's' : ''}` :
    ''

  // Nothing to show at all
  if (photoCount === 0 && deviceCount === 0) return null

  // If current mode has nothing, show collapsed height so toggle is still accessible
  const currentEmpty = (mode === 'photos' && photoCount === 0) || (mode === 'devices' && deviceCount === 0)
  const effectiveHeight = collapsed || currentEmpty ? COLLAPSED_H : STRIP_HEIGHT

  return (
    <div style={{ ...s.wrap, height: effectiveHeight }}>
      {/* Toggle tab */}
      <button style={s.toggleBtn} onClick={onToggleMode}>
        <span style={s.toggleIcon}>{collapsed ? '▴' : '▾'}</span>
        <span style={s.toggleLabel}>{toggleLabel || 'Show'}</span>
      </button>

      {/* Content */}
      {mode === 'photos' && (
        <ImageStrip
          observations={observations}
          selectedObsId={selectedObsId}
          onSelect={onSelectObs}
          onImageClick={onImageClick}
          collapsed={false}
          onToggleCollapse={onToggleMode}
          onHover={onHoverObs}
          hideToggle
        />
      )}

      {mode === 'devices' && (
        <DeviceStrip
          devices={devices}
          selectedDeviceId={selectedDeviceId}
          onSelect={onSelectDevice}
          onHover={onHoverDevice}
          trailDeviceIds={trailDeviceIds}
          onToggleTrail={onToggleTrail}
        />
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
}

export { STRIP_HEIGHT, COLLAPSED_H }
