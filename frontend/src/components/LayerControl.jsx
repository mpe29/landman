import { useState } from 'react'
import { ACTIVE_LAYERS, LAYER_GROUPS } from '../constants/layers'
import { POINT_TYPES } from '../constants/pointTypes'

export default function LayerControl({ visibility, onChange }) {
  const [collapsed, setCollapsed] = useState(false)

  // Group active layers by their group id
  const grouped = LAYER_GROUPS.map((group) => ({
    ...group,
    layers: ACTIVE_LAYERS.filter((l) => l.group === group.id),
  })).filter((g) => g.layers.length > 0)

  return (
    <div style={styles.panel}>
      <button style={styles.header} onClick={() => setCollapsed((c) => !c)}>
        <span style={styles.title}>LAYERS</span>
        <span style={styles.chevron}>{collapsed ? '▸' : '▾'}</span>
      </button>

      {!collapsed && (
        <div style={styles.body}>
          {grouped.map((group) => (
            <div key={group.id} style={styles.group}>
              <span style={styles.groupLabel}>{group.label}</span>
              {group.layers.map((layer) => (
                <LayerRow
                  key={layer.id}
                  layer={layer}
                  visible={visibility[layer.id] !== false}
                  onChange={(v) => onChange(layer.id, v)}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function LayerRow({ layer, visible, onChange }) {
  // For multi-color point layers, show a small swatch row
  const swatches = layer.color === 'multi' ? POINT_TYPES.slice(0, 5) : null

  return (
    <div style={styles.row} onClick={() => onChange(!visible)}>
      <div style={styles.rowLeft}>
        {swatches ? (
          <div style={styles.swatchRow}>
            {swatches.map((pt) => (
              <span
                key={pt.id}
                style={{ ...styles.swatch, background: pt.color, opacity: visible ? 1 : 0.3 }}
                title={pt.label}
              />
            ))}
          </div>
        ) : layer.type === 'polygon' ? (
          <span style={{
            ...styles.colorBlock,
            background: visible ? layer.color + '30' : 'transparent',
            borderColor: visible ? layer.color : 'rgba(255,255,255,0.15)',
          }} />
        ) : layer.type === 'line' ? (
          <span style={{ ...styles.colorLine, borderColor: visible ? layer.color : 'rgba(255,255,255,0.15)' }} />
        ) : (
          <span style={{ ...styles.colorDot, background: visible ? layer.color : 'rgba(255,255,255,0.15)' }} />
        )}
        <span style={{ ...styles.layerLabel, opacity: visible ? 1 : 0.4 }}>{layer.label}</span>
      </div>
      {/* Toggle */}
      <div style={{ ...styles.toggle, background: visible ? '#4ade80' : 'rgba(255,255,255,0.12)' }}>
        <div style={{ ...styles.toggleThumb, transform: visible ? 'translateX(12px)' : 'translateX(1px)' }} />
      </div>
    </div>
  )
}

const styles = {
  panel: {
    position: 'absolute',
    bottom: 32,
    left: 16,
    zIndex: 10,
    background: 'rgba(15, 20, 25, 0.92)',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10,
    boxShadow: '0 2px 16px rgba(0,0,0,0.5)',
    minWidth: 200,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    background: 'transparent',
    border: 'none',
    padding: '9px 14px',
    cursor: 'pointer',
  },
  title: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.12em',
  },
  chevron: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 11,
  },
  body: {
    padding: '2px 0 8px',
    borderTop: '1px solid rgba(255,255,255,0.06)',
  },
  group: {
    padding: '6px 0 2px',
  },
  groupLabel: {
    display: 'block',
    color: 'rgba(255,255,255,0.22)',
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    padding: '0 14px 4px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '5px 14px',
    cursor: 'pointer',
    gap: 10,
  },
  rowLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  colorBlock: {
    width: 16,
    height: 12,
    borderRadius: 3,
    border: '2px solid',
    flexShrink: 0,
  },
  colorLine: {
    width: 16,
    height: 0,
    borderTop: '2px solid',
    flexShrink: 0,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    flexShrink: 0,
  },
  swatchRow: {
    display: 'flex',
    gap: 2,
    flexShrink: 0,
  },
  swatch: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    display: 'inline-block',
  },
  layerLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  toggle: {
    width: 26,
    height: 14,
    borderRadius: 7,
    position: 'relative',
    transition: 'background 0.2s',
    flexShrink: 0,
  },
  toggleThumb: {
    position: 'absolute',
    top: 1,
    width: 12,
    height: 12,
    borderRadius: '50%',
    background: '#fff',
    transition: 'transform 0.2s',
  },
}
