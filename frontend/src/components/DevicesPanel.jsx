import { useState, useEffect, useCallback, useMemo } from 'react'
import { T, C, PANEL_SHELL, PANEL_HEADER, PANEL_TITLE, PANEL_CHEVRON } from '../constants/theme'
import { api } from '../api'

// Category display info — icons match device_types.icon in DB
const CATEGORIES = [
  { key: 'routing',      label: 'Routing',      icon: '🗼' },
  { key: 'gps_tracker',  label: 'GPS Trackers',  icon: '📡' },
  { key: 'environment',  label: 'Environment',   icon: '🌡️' },
  { key: 'water_level',  label: 'Water Level',   icon: '💧' },
  { key: 'door_sensor',  label: 'Door Sensors',  icon: '🚪' },
  { key: 'other',        label: 'Other',          icon: '📦' },
]

const RANGE_PRESETS = [
  { key: 'today', label: 'Today' },
  { key: '7d',    label: '7 days' },
  { key: '30d',   label: '30 days' },
]

export default function DevicesPanel({
  isOpen, onOpen,
  // Filter props — managed by App.jsx
  deviceFilter, onFilterChange, onFilterApply, onFilterClear, deviceFilterActive,
  // Viewport filter
  viewportOnly, onToggleViewport,
}) {
  const [devices,      setDevices]      = useState([])

  const refresh = useCallback(() => {
    api.getDevices().then(setDevices).catch(console.error)
  }, [])

  useEffect(() => {
    if (!isOpen) return
    refresh()
  }, [isOpen, refresh])

  // Count devices by category for the filter checkboxes
  const categoryCounts = useMemo(() => {
    const counts = {}
    for (const d of devices) {
      const cat = d.device_types?.category || 'other'
      counts[cat] = (counts[cat] || 0) + 1
    }
    return counts
  }, [devices])

  // Category filter state (null = all shown)
  const selectedCategories = deviceFilter?.categories || null
  const toggleCategory = (catKey) => {
    const current = selectedCategories || CATEGORIES.map((c) => c.key)
    const next = current.includes(catKey)
      ? current.filter((k) => k !== catKey)
      : [...current, catKey]
    onFilterChange?.({ ...deviceFilter, categories: next.length === CATEGORIES.length ? null : next })
  }

  const range = deviceFilter?.range || 'today'
  const hourFrom = deviceFilter?.hourFrom ?? 6
  const hourTo = deviceFilter?.hourTo ?? 18

  return (
    <div style={PANEL_SHELL}>
      <button onClick={onOpen} title="Devices" style={PANEL_HEADER}>
        <span style={PANEL_TITLE}>DEVICES</span>
        {deviceFilterActive && <span style={s.activeDot} />}
        <span style={PANEL_CHEVRON}>{isOpen ? '▾' : '▸'}</span>
      </button>

      {isOpen && (
        <div style={s.body}>
          <div style={s.header}>
            <span style={s.title}>Filter</span>
            <button onClick={refresh} style={s.refreshBtn} title="Refresh">↻</button>
          </div>

          <div style={{ padding: '8px 12px' }}>
            {/* Device type categories */}
            <div style={{ marginBottom: 12 }}>
              <span style={s.filterLabel}>DEVICE TYPES</span>
              {CATEGORIES.map((cat) => {
                const count = categoryCounts[cat.key] || 0
                if (count === 0) return null
                const checked = !selectedCategories || selectedCategories.includes(cat.key)
                return (
                  <label key={cat.key} style={s.checkRow}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCategory(cat.key)}
                      style={{ marginRight: 6, accentColor: '#22c55e' }}
                    />
                    <span style={{ fontSize: 12 }}>{cat.icon}</span>
                    <span style={{ fontSize: 11, marginLeft: 4 }}>{cat.label}</span>
                    <span style={s.catCount}>{count}</span>
                  </label>
                )
              })}
            </div>

            {/* Viewport filter */}
            <div style={{ marginBottom: 12 }}>
              <label style={s.checkRow}>
                <input
                  type="checkbox"
                  checked={!!viewportOnly}
                  onChange={() => onToggleViewport?.()}
                  style={{ marginRight: 6, accentColor: '#22c55e' }}
                />
                <span style={{ fontSize: 11 }}>Show only in view</span>
              </label>
            </div>

            {/* Date range — controls trail data */}
            <div style={{ marginBottom: 10 }}>
              <span style={s.filterLabel}>TRAIL DATE RANGE</span>
              <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                {RANGE_PRESETS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => onFilterChange?.({ ...deviceFilter, range: p.key })}
                    style={{
                      ...s.presetBtn,
                      ...(range === p.key ? s.presetActive : {}),
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Time of day */}
            <div style={{ marginBottom: 12 }}>
              <span style={s.filterLabel}>TIME OF DAY</span>
              <div style={{ fontSize: 11, color: T.text, marginBottom: 4, marginTop: 4 }}>
                {String(hourFrom).padStart(2, '0')}:00 — {String(hourTo).padStart(2, '0')}:00
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, color: T.textMuted, width: 28 }}>From</span>
                <input
                  type="range"
                  min={0} max={23} value={hourFrom}
                  onChange={(e) => onFilterChange?.({ ...deviceFilter, hourFrom: Number(e.target.value) })}
                  style={{ flex: 1, accentColor: '#22c55e' }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                <span style={{ fontSize: 10, color: T.textMuted, width: 28 }}>To</span>
                <input
                  type="range"
                  min={1} max={24} value={hourTo}
                  onChange={(e) => onFilterChange?.({ ...deviceFilter, hourTo: Number(e.target.value) })}
                  style={{ flex: 1, accentColor: '#22c55e' }}
                />
              </div>
            </div>

            {/* Apply / Clear */}
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => onFilterApply?.()}
                style={{ ...s.applyBtn, flex: 1 }}
              >
                Apply Trail Filter
              </button>
              {deviceFilterActive && (
                <button onClick={() => onFilterClear?.()} style={s.clearBtn}>
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


const s = {
  body: {
    maxHeight: 520, overflowY: 'auto',
    borderTop: `1px solid ${T.surfaceBorder}`,
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 12px 6px',
    borderBottom: '1px solid rgba(180,170,150,0.25)',
  },
  title:      { fontSize: 13, fontWeight: 600, color: T.text },
  refreshBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, color: T.textMuted, padding: '0 2px', fontFamily: 'inherit' },
  activeDot: {
    width: 6, height: 6, borderRadius: '50%',
    background: '#22c55e', marginLeft: 4, flexShrink: 0,
  },
  // Filter-specific
  filterLabel: {
    display: 'block', fontSize: 9, fontWeight: 700, color: T.textMuted,
    letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4,
  },
  checkRow: {
    display: 'flex', alignItems: 'center', padding: '3px 0',
    cursor: 'pointer', fontSize: 11, color: T.text,
  },
  catCount: {
    marginLeft: 'auto', fontSize: 10, color: T.textMuted,
    background: 'rgba(180,170,150,0.2)', borderRadius: 8,
    padding: '1px 6px',
  },
  presetBtn: {
    flex: 1, padding: '5px 0', fontSize: 11, fontWeight: 600,
    background: 'transparent', border: `1px solid ${T.surfaceBorder}`,
    borderRadius: 6, cursor: 'pointer', color: T.textMuted,
    fontFamily: 'inherit', transition: 'all 0.12s',
  },
  presetActive: {
    background: '#22c55e1a', borderColor: '#22c55e', color: '#22c55e', fontWeight: 700,
  },
  applyBtn: {
    padding: '7px 0', marginTop: 0,
    background: T.text, color: '#fff', border: 'none',
    borderRadius: 6, cursor: 'pointer', fontSize: 12,
    fontFamily: 'inherit', fontWeight: 600, transition: 'opacity 0.15s',
  },
  clearBtn: {
    padding: '7px 14px',
    background: 'transparent', border: `1px solid ${T.surfaceBorder}`,
    borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600,
    fontFamily: 'inherit', color: T.textMuted,
  },
}
