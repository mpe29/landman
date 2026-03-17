import { useState, useEffect, useCallback, useRef } from 'react'
import { T, PANEL_SHELL, PANEL_HEADER, PANEL_TITLE, PANEL_CHEVRON } from '../constants/theme'
import { api } from '../api'

const TWO_HOURS_MS = 2 * 60 * 60 * 1000

function deviceStatus(d) {
  if (!d.active) return 'inactive'
  const age = d.last_seen_at ? Date.now() - new Date(d.last_seen_at).getTime() : Infinity
  return age < TWO_HOURS_MS ? 'fresh' : 'stale'
}

const STATUS_COLOR = { fresh: '#22c55e', stale: '#f59e0b', inactive: '#9ca3af' }
const STATUS_LABEL = { fresh: 'Live', stale: 'Stale', inactive: 'Unregistered' }

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 2)  return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function formatTime(ts) {
  const t = new Date(ts)
  return t.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' })
    + ' ' + t.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
}

// Render extra fields from sensor reading
function ExtraFields({ extra }) {
  if (!extra) return null
  const fields = []
  if (extra.temperature_c != null)     fields.push(`${extra.temperature_c}°C`)
  if (extra.humidity_pct != null)      fields.push(`${extra.humidity_pct}% RH`)
  if (extra.soil_moisture_pct != null) fields.push(`Soil ${extra.soil_moisture_pct}%`)
  if (extra.soil_temperature_c != null) fields.push(`Soil ${extra.soil_temperature_c}°C`)
  if (extra.water_level_mm != null)    fields.push(`Water ${extra.water_level_mm}mm`)
  if (extra.door_open != null)         fields.push(extra.door_open ? 'Open' : 'Closed')
  if (extra.wind_speed_kmh != null)    fields.push(`Wind ${extra.wind_speed_kmh}km/h`)
  if (extra.rainfall_mm != null)       fields.push(`Rain ${extra.rainfall_mm}mm`)
  if (extra.motion_detected != null)   fields.push(extra.motion_detected ? 'Motion' : 'No motion')
  if (extra.has_fix != null && !extra.has_fix) fields.push('No GPS fix')
  return fields.length > 0 ? <>{fields.map((f, i) => <span key={i}>{f}</span>)}</> : null
}

const TABS = [
  { key: 'registered',   label: 'Registered' },
  { key: 'unregistered', label: 'Unregistered' },
  { key: 'routing',      label: 'Routing' },
  { key: 'filter',       label: 'Filter' },
]

export default function DevicesPanel({
  isOpen, onOpen,
  // Filter props — managed by App.jsx
  deviceFilter, onFilterChange, onFilterApply, onFilterClear, deviceFilterActive,
  // Routing placement
  onPlaceRouting,
  // Areas for assignment
  areas,
}) {
  const [devices,      setDevices]      = useState([])
  const [deviceTypes,  setDeviceTypes]  = useState([])
  const [selected,     setSelected]     = useState(null)
  const [readings,     setReadings]     = useState([])
  const [routingLog,   setRoutingLog]   = useState([])
  const [tab,          setTab]          = useState('registered')
  const [form,         setForm]         = useState({ name: '', notes: '', deviceTypeId: '', areaId: '' })
  const [saving,       setSaving]       = useState(false)
  const [backfillMsg,  setBackfillMsg]  = useState(null)
  const [loadingReadings, setLoadingReadings] = useState(false)

  const refresh = useCallback(() => {
    api.getDevices().then(setDevices).catch(console.error)
    api.getDeviceTypes().then(setDeviceTypes).catch(console.error)
  }, [])

  useEffect(() => {
    if (!isOpen) return
    refresh()
  }, [isOpen, refresh])

  // Load readings or routing log when selecting a device
  useEffect(() => {
    if (!selected) return
    const isRouting = selected.device_types?.category === 'routing'
    setLoadingReadings(true)
    setBackfillMsg(null)
    if (isRouting) {
      api.getRoutingLog(selected.dev_eui, 20)
        .then(setRoutingLog)
        .catch(console.error)
        .finally(() => setLoadingReadings(false))
    } else {
      api.getDeviceReadings(selected.id, 20)
        .then(setReadings)
        .catch(console.error)
        .finally(() => setLoadingReadings(false))
    }
  }, [selected?.id])

  const handleSelect = (device) => {
    setSelected(device)
    setForm({
      name:         device.name,
      notes:        device.notes || '',
      deviceTypeId: device.device_type_id || '',
      areaId:       device.area_id || '',
    })
    setReadings([])
    setRoutingLog([])
    setBackfillMsg(null)
  }

  const handleBack = () => { setSelected(null); setBackfillMsg(null) }

  const handleSave = async () => {
    setSaving(true)
    setBackfillMsg(null)
    try {
      const wasUnregistered = !selected.active
      await api.updateDevice(selected.id, {
        name:         form.name.trim() || selected.name,
        notes:        form.notes,
        active:       true,
        deviceTypeId: form.deviceTypeId || null,
        areaId:       form.areaId || null,
      })

      if (wasUnregistered || form.deviceTypeId !== (selected.device_type_id || '')) {
        const count = await api.backfillDeviceReadings(selected.id)
        setBackfillMsg(count > 0
          ? `Backfilled ${count} historic reading${count !== 1 ? 's' : ''}`
          : 'Registered — no historic readings to backfill'
        )
      }

      const updated = await api.getDevices()
      setDevices(updated)
      const refreshed = updated.find((d) => d.id === selected.id)
      if (refreshed) {
        setSelected(refreshed)
        setForm({ name: refreshed.name, notes: refreshed.notes || '', deviceTypeId: refreshed.device_type_id || '', areaId: refreshed.area_id || '' })
      }
      api.getDeviceReadings(selected.id, 20).then(setReadings).catch(console.error)
    } catch (err) {
      alert('Save failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const isRouting = (d) => d.device_types?.category === 'routing'
  const registered   = devices.filter((d) => d.active && !isRouting(d))
  const unregistered = devices.filter((d) => !d.active && !isRouting(d))
  const routing      = devices.filter((d) => isRouting(d))
  const gpsDevices   = registered.filter((d) =>
    d.device_types?.category === 'gps_tracker' || d.last_lat != null
  )

  const tabCounts = {
    registered:   registered.length,
    unregistered: unregistered.length,
    routing:      routing.length,
    filter:       deviceFilterActive ? 1 : 0,
  }

  const listForTab = tab === 'registered' ? registered
    : tab === 'unregistered' ? unregistered
    : tab === 'routing' ? routing
    : []

  const emptyMsg = {
    registered:   'No registered devices',
    unregistered: 'No unregistered devices',
    routing:      'No routing devices discovered yet',
  }

  return (
    <div style={PANEL_SHELL}>
      <button onClick={onOpen} title="Devices" style={PANEL_HEADER}>
        <span style={PANEL_TITLE}>DEVICES</span>
        <span style={PANEL_CHEVRON}>{isOpen ? '▾' : '▸'}</span>
      </button>

      {isOpen && (
        <div style={s.body}>
          {selected ? (
            <DetailView
              device={selected}
              form={form}
              setForm={setForm}
              deviceTypes={deviceTypes}
              areas={areas}
              readings={readings}
              routingLog={routingLog}
              loadingReadings={loadingReadings}
              saving={saving}
              backfillMsg={backfillMsg}
              onBack={handleBack}
              onSave={handleSave}
              onPlaceRouting={onPlaceRouting}
              onShowTrail={(deviceId) => {
                const f = { ...deviceFilter, deviceIds: [deviceId] }
                onFilterChange?.(f)
                setTab('filter')
                handleBack()
              }}
            />
          ) : tab === 'filter' ? (
            <FilterView
              gpsDevices={gpsDevices}
              filter={deviceFilter}
              onChange={onFilterChange}
              onApply={onFilterApply}
              onClear={onFilterClear}
              isActive={deviceFilterActive}
              onRefresh={refresh}
            />
          ) : (
            <ListView
              tab={tab}
              setTab={setTab}
              tabCounts={tabCounts}
              list={listForTab}
              emptyMsg={emptyMsg[tab]}
              onSelect={handleSelect}
              onRefresh={refresh}
            />
          )}
        </div>
      )}
    </div>
  )
}


/* ── List View ─────────────────────────────────────────────────────────── */
function ListView({ tab, setTab, tabCounts, list, emptyMsg, onSelect, onRefresh }) {
  return (
    <>
      <div style={s.header}>
        <span style={s.title}>Devices</span>
        <button onClick={onRefresh} style={s.refreshBtn} title="Refresh">↻</button>
      </div>

      <div style={s.tabs}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{ ...s.tabBtn, ...(tab === t.key ? s.tabActive : {}) }}
          >
            {t.label}
            {tabCounts[t.key] > 0 && <span style={s.badge}>{tabCounts[t.key]}</span>}
          </button>
        ))}
      </div>

      <div style={s.list}>
        {list.length === 0 && (
          <div style={{ ...s.muted, textAlign: 'center', padding: '16px 0' }}>{emptyMsg}</div>
        )}
        {list.map((d) => {
          const status = deviceStatus(d)
          return (
            <div key={d.id} style={s.deviceRow} onClick={() => onSelect(d)}>
              <span style={{ ...s.statusDot, background: STATUS_COLOR[status] }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={s.deviceName}>
                  {d.device_types?.icon && <span style={{ marginRight: 4 }}>{d.device_types.icon}</span>}
                  {d.name}
                </div>
                <div style={s.deviceMeta}>
                  <span style={{ fontFamily: T.fontMono, fontSize: 10 }}>
                    {d.dev_eui?.slice(-8).toUpperCase()}
                  </span>
                  {d.last_seen_at && ` · ${timeAgo(d.last_seen_at)}`}
                  {d.last_battery_pct != null && ` · ${d.last_battery_pct}%`}
                </div>
              </div>
              <span style={s.chevron}>›</span>
            </div>
          )
        })}
      </div>
    </>
  )
}


/* ── Detail View ───────────────────────────────────────────────────────── */
function DetailView({
  device, form, setForm, deviceTypes, areas,
  readings, routingLog, loadingReadings, saving, backfillMsg,
  onBack, onSave, onPlaceRouting, onShowTrail,
}) {
  const isRoutingDevice = device.device_types?.category === 'routing'
  const hasLocation = device.last_lat != null && device.last_lng != null

  return (
    <>
      <div style={s.header}>
        <button onClick={onBack} style={s.backBtn}>← Devices</button>
      </div>

      <div style={s.formSection}>
        <div style={s.eui}>{device.dev_eui?.toUpperCase()}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <span style={{ ...s.statusDot, background: STATUS_COLOR[deviceStatus(device)] }} />
          <span style={{ fontSize: 11, color: T.textMuted }}>
            {STATUS_LABEL[deviceStatus(device)]}
            {device.last_seen_at && ` · ${timeAgo(device.last_seen_at)}`}
            {device.last_battery_pct != null && ` · ${device.last_battery_pct}%`}
          </span>
        </div>

        <label style={s.label}>Device type</label>
        <select
          style={s.input}
          value={form.deviceTypeId}
          onChange={(e) => setForm((p) => ({ ...p, deviceTypeId: e.target.value }))}
        >
          <option value="">— Select type —</option>
          {deviceTypes.map((dt) => (
            <option key={dt.id} value={dt.id}>
              {dt.icon ? `${dt.icon} ` : ''}{dt.name}
            </option>
          ))}
        </select>

        <label style={s.label}>Name</label>
        <input
          style={s.input}
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
        />

        {areas && areas.length > 0 && (
          <>
            <label style={s.label}>Area</label>
            <select
              style={s.input}
              value={form.areaId}
              onChange={(e) => setForm((p) => ({ ...p, areaId: e.target.value }))}
            >
              <option value="">— No area —</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>{a.name || a.id}</option>
              ))}
            </select>
          </>
        )}

        <label style={s.label}>Notes</label>
        <input
          style={s.input}
          value={form.notes}
          placeholder="Optional"
          onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
        />

        <button onClick={onSave} disabled={saving} style={s.saveBtn}>
          {saving ? 'Saving & backfilling…' : device.active ? 'Save' : 'Register device'}
        </button>

        {backfillMsg && <div style={s.backfillMsg}>{backfillMsg}</div>}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          {isRoutingDevice && (
            <button
              onClick={() => onPlaceRouting?.(device)}
              style={s.actionBtn}
            >
              {hasLocation ? 'Move on Map' : 'Place on Map'}
            </button>
          )}
          {!isRoutingDevice && device.active && device.last_lat != null && (
            <button
              onClick={() => onShowTrail?.(device.id)}
              style={s.actionBtn}
            >
              Show Trail
            </button>
          )}
        </div>
      </div>

      {/* Readings or Routing Log */}
      <div style={s.logSection}>
        <div style={s.logTitle}>
          {isRoutingDevice ? 'Routing Log' : `Recent Readings (${readings.length})`}
        </div>
        {loadingReadings && <div style={s.muted}>Loading…</div>}

        {isRoutingDevice ? (
          <>
            {!loadingReadings && routingLog.length === 0 && (
              <div style={s.muted}>No readings relayed yet</div>
            )}
            {routingLog.map((r) => (
              <div key={r.reading_id} style={s.logRow}>
                <div style={s.logTime}>{formatTime(r.received_at)}</div>
                <div style={s.logFields}>
                  <span style={{ fontWeight: 600 }}>{r.device_name}</span>
                  <span style={{ fontFamily: T.fontMono, fontSize: 10 }}>{r.device_eui?.slice(-8).toUpperCase()}</span>
                  {r.rssi != null && <span>{r.rssi} dBm</span>}
                  {r.snr  != null && <span>SNR {r.snr}</span>}
                </div>
              </div>
            ))}
          </>
        ) : (
          <>
            {!loadingReadings && readings.length === 0 && (
              <div style={s.muted}>No readings yet</div>
            )}
            {readings.map((r) => {
              const hasGps = r.lat != null && r.lng != null
              return (
                <div key={r.id} style={s.logRow}>
                  <div style={s.logTime}>{formatTime(r.received_at)}</div>
                  <div style={s.logFields}>
                    {r.battery_pct != null && <span>{r.battery_pct}%</span>}
                    {r.rssi        != null && <span>{r.rssi} dBm</span>}
                    {r.snr         != null && <span>SNR {r.snr}</span>}
                    <ExtraFields extra={r.extra} />
                    <span style={{ color: hasGps ? '#22c55e' : T.textMuted }}>
                      {hasGps
                        ? `GPS ${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}`
                        : 'No GPS fix'}
                    </span>
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>
    </>
  )
}


/* ── Filter View ───────────────────────────────────────────────────────── */
const RANGE_PRESETS = [
  { key: 'today', label: 'Today' },
  { key: '7d',    label: '7 days' },
  { key: '30d',   label: '30 days' },
]

function FilterView({ gpsDevices, filter, onChange, onApply, onClear, isActive, onRefresh }) {
  const selectedIds = filter?.deviceIds || []
  const range = filter?.range || 'today'
  const hourFrom = filter?.hourFrom ?? 6
  const hourTo = filter?.hourTo ?? 18

  const toggleDevice = (id) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id]
    onChange?.({ ...filter, deviceIds: next })
  }

  const toggleAll = () => {
    const allSelected = gpsDevices.every((d) => selectedIds.includes(d.id))
    onChange?.({ ...filter, deviceIds: allSelected ? [] : gpsDevices.map((d) => d.id) })
  }

  const setRange = (r) => onChange?.({ ...filter, range: r })

  return (
    <>
      <div style={s.header}>
        <span style={s.title}>Device Filter</span>
        <button onClick={onRefresh} style={s.refreshBtn} title="Refresh">↻</button>
      </div>

      <div style={s.tabs}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => {}} // tabs are for visual context, handled by parent
            style={{ ...s.tabBtn, ...(t.key === 'filter' ? s.tabActive : {}) }}
            disabled={t.key !== 'filter'}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: '8px 12px' }}>
        {/* Device selector */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={s.filterLabel}>GPS DEVICES</span>
            <button onClick={toggleAll} style={s.selectAllBtn}>
              {gpsDevices.every((d) => selectedIds.includes(d.id)) ? 'Deselect All' : 'Select All'}
            </button>
          </div>
          {gpsDevices.length === 0 && (
            <div style={s.muted}>No GPS devices registered</div>
          )}
          {gpsDevices.map((d) => {
            const checked = selectedIds.includes(d.id)
            return (
              <label key={d.id} style={s.checkRow}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleDevice(d.id)}
                  style={{ marginRight: 6, accentColor: '#22c55e' }}
                />
                <span style={{ ...s.statusDot, background: STATUS_COLOR[deviceStatus(d)], marginRight: 6 }} />
                <span style={{ fontSize: 11 }}>
                  {d.device_types?.icon && `${d.device_types.icon} `}{d.name}
                </span>
              </label>
            )
          })}
        </div>

        {/* Date range */}
        <div style={{ marginBottom: 10 }}>
          <span style={s.filterLabel}>DATE RANGE</span>
          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
            {RANGE_PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => setRange(p.key)}
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

        {/* Time of day slider */}
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
              onChange={(e) => onChange?.({ ...filter, hourFrom: Number(e.target.value) })}
              style={{ flex: 1, accentColor: '#22c55e' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
            <span style={{ fontSize: 10, color: T.textMuted, width: 28 }}>To</span>
            <input
              type="range"
              min={1} max={24} value={hourTo}
              onChange={(e) => onChange?.({ ...filter, hourTo: Number(e.target.value) })}
              style={{ flex: 1, accentColor: '#22c55e' }}
            />
          </div>
        </div>

        {/* Apply / Clear */}
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => onApply?.()}
            disabled={selectedIds.length === 0}
            style={{
              ...s.saveBtn,
              flex: 1,
              opacity: selectedIds.length === 0 ? 0.5 : 1,
              cursor: selectedIds.length === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            Apply Filter
          </button>
          {isActive && (
            <button onClick={() => onClear?.()} style={s.clearFilterBtn}>
              Clear
            </button>
          )}
        </div>
      </div>
    </>
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
  backBtn:    { background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: T.textMuted, padding: 0, fontFamily: 'inherit' },
  refreshBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, color: T.textMuted, padding: '0 2px', fontFamily: 'inherit' },
  tabs:       { display: 'flex', borderBottom: '1px solid rgba(180,170,150,0.25)' },
  tabBtn: {
    flex: 1, padding: '7px 4px',
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: 10, color: T.textMuted, fontFamily: 'inherit',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
    transition: 'all 0.15s', boxShadow: 'none',
  },
  tabActive: { color: T.text, boxShadow: `inset 0 -2px 0 ${T.text}` },
  badge:     { background: '#e5e1d0', borderRadius: 8, padding: '1px 5px', fontSize: 9, color: T.text },
  list:      { padding: '4px 0' },
  deviceRow: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '9px 12px', cursor: 'pointer', transition: 'background 0.1s',
    borderBottom: '1px solid rgba(180,170,150,0.12)',
  },
  statusDot:  { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  deviceName: { fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 1 },
  deviceMeta: { fontSize: 11, color: T.textMuted },
  chevron:    { fontSize: 16, color: T.textMuted, flexShrink: 0 },
  formSection: { padding: '10px 12px 4px' },
  eui: { fontFamily: T.fontMono, fontSize: 10, color: T.textMuted, letterSpacing: '0.05em', marginBottom: 6 },
  label: { display: 'block', fontSize: 11, color: T.textMuted, marginBottom: 3, marginTop: 8 },
  input: {
    width: '100%', boxSizing: 'border-box',
    padding: '5px 8px', fontSize: 12,
    background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(180,170,150,0.4)',
    borderRadius: 6, color: T.text, fontFamily: 'inherit', outline: 'none',
  },
  saveBtn: {
    marginTop: 10, width: '100%', padding: '7px 0',
    background: T.text, color: '#fff', border: 'none',
    borderRadius: 6, cursor: 'pointer', fontSize: 12,
    fontFamily: 'inherit', fontWeight: 600, transition: 'opacity 0.15s',
  },
  actionBtn: {
    flex: 1, padding: '6px 0', marginTop: 0,
    background: 'transparent', border: `1px solid ${T.surfaceBorder}`,
    borderRadius: 6, cursor: 'pointer', fontSize: 11,
    fontFamily: 'inherit', fontWeight: 600, color: T.textMuted,
    transition: 'all 0.15s',
  },
  backfillMsg: {
    marginTop: 8, padding: '5px 8px',
    background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
    borderRadius: 6, fontSize: 11, color: '#15803d',
  },
  logSection:  { padding: '8px 12px 12px', borderTop: '1px solid rgba(180,170,150,0.25)' },
  logTitle:    { fontSize: 11, fontWeight: 600, color: T.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' },
  logRow:      { padding: '5px 0', borderBottom: '1px solid rgba(180,170,150,0.12)' },
  logTime:     { fontSize: 10, color: T.textMuted, marginBottom: 2 },
  logFields:   { display: 'flex', flexWrap: 'wrap', gap: '4px 10px', fontSize: 11, color: T.text },
  muted:       { fontSize: 12, color: T.textMuted },
  // Filter-specific
  filterLabel: {
    display: 'block', fontSize: 9, fontWeight: 700, color: T.textMuted,
    letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2,
  },
  selectAllBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: 10, color: T.textMuted, fontFamily: 'inherit', padding: 0,
    textDecoration: 'underline',
  },
  checkRow: {
    display: 'flex', alignItems: 'center', padding: '4px 0',
    cursor: 'pointer', fontSize: 11, color: T.text,
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
  clearFilterBtn: {
    padding: '7px 14px', marginTop: 10,
    background: 'transparent', border: `1px solid ${T.surfaceBorder}`,
    borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600,
    fontFamily: 'inherit', color: T.textMuted,
  },
}
