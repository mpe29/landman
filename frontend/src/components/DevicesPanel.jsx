import { useState, useEffect } from 'react'
import { T } from '../constants/theme'
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

export default function DevicesPanel({ isOpen, onOpen }) {
  const [devices,      setDevices]      = useState([])
  const [deviceTypes,  setDeviceTypes]  = useState([])
  const [selected,     setSelected]     = useState(null)
  const [readings,     setReadings]     = useState([])
  const [tab,          setTab]          = useState('unregistered')
  const [form,         setForm]         = useState({ name: '', notes: '', deviceTypeId: '' })
  const [saving,       setSaving]       = useState(false)
  const [backfillMsg,  setBackfillMsg]  = useState(null)
  const [loadingReadings, setLoadingReadings] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    api.getDevices().then(setDevices).catch(console.error)
    api.getDeviceTypes().then(setDeviceTypes).catch(console.error)
  }, [isOpen])

  useEffect(() => {
    if (!selected) return
    setLoadingReadings(true)
    setBackfillMsg(null)
    api.getDeviceReadings(selected.id, 25)
      .then(setReadings)
      .catch(console.error)
      .finally(() => setLoadingReadings(false))
  }, [selected?.id])

  const handleSelect = (device) => {
    setSelected(device)
    setForm({
      name:         device.name,
      notes:        device.notes || '',
      deviceTypeId: device.device_type_id || '',
    })
    setReadings([])
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
      })

      // Backfill historic readings now that device type is known
      if (wasUnregistered || form.deviceTypeId !== (selected.device_type_id || '')) {
        const count = await api.backfillDeviceReadings(selected.id)
        setBackfillMsg(count > 0
          ? `✓ Backfilled ${count} historic reading${count !== 1 ? 's' : ''}`
          : '✓ Registered — no historic readings to backfill'
        )
      }

      const updated  = await api.getDevices()
      setDevices(updated)
      const refreshed = updated.find((d) => d.id === selected.id)
      if (refreshed) {
        setSelected(refreshed)
        setForm({ name: refreshed.name, notes: refreshed.notes || '', deviceTypeId: refreshed.device_type_id || '' })
      }
      // Reload readings so backfilled lat/lng shows
      api.getDeviceReadings(selected.id, 25).then(setReadings).catch(console.error)
    } catch (err) {
      alert('Save failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const registered   = devices.filter((d) => d.active)
  const unregistered = devices.filter((d) => !d.active)
  const currentList  = tab === 'registered' ? registered : unregistered

  return (
    <div>
      {/* ── Trigger button ── */}
      <button
        onClick={onOpen}
        title="Devices"
        style={{ ...s.btn, ...(isOpen ? s.btnActive : {}) }}
      >
        📡
      </button>

      {/* ── Panel ── */}
      {isOpen && (
        <div style={s.panel}>
          {selected ? (
            /* ── Detail view ─────────────────────────────── */
            <>
              <div style={s.header}>
                <button onClick={handleBack} style={s.backBtn}>← Devices</button>
              </div>

              <div style={s.formSection}>
                <div style={s.eui}>{selected.dev_eui?.toUpperCase()}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <span style={{ ...s.statusDot, background: STATUS_COLOR[deviceStatus(selected)] }} />
                  <span style={{ fontSize: 11, color: T.textMuted }}>
                    {STATUS_LABEL[deviceStatus(selected)]}
                    {selected.last_seen_at && ` · ${timeAgo(selected.last_seen_at)}`}
                    {selected.last_battery_pct != null && ` · 🔋${selected.last_battery_pct}%`}
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

                <label style={s.label}>Notes</label>
                <input
                  style={s.input}
                  value={form.notes}
                  placeholder="Optional"
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                />

                <button onClick={handleSave} disabled={saving} style={s.saveBtn}>
                  {saving ? 'Saving & backfilling…' : selected.active ? 'Save' : 'Register device'}
                </button>

                {backfillMsg && (
                  <div style={s.backfillMsg}>{backfillMsg}</div>
                )}
              </div>

              {/* Readings log */}
              <div style={s.logSection}>
                <div style={s.logTitle}>Recent Readings</div>
                {loadingReadings && <div style={s.muted}>Loading…</div>}
                {!loadingReadings && readings.length === 0 && (
                  <div style={s.muted}>No readings yet</div>
                )}
                {readings.map((r) => {
                  const hasGps = r.lat != null && r.lng != null
                  const t      = new Date(r.received_at)
                  const timeStr = t.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' })
                    + ' ' + t.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
                  return (
                    <div key={r.id} style={s.logRow}>
                      <div style={s.logTime}>{timeStr}</div>
                      <div style={s.logFields}>
                        {r.battery_pct != null && <span>🔋{r.battery_pct}%</span>}
                        {r.rssi        != null && <span>{r.rssi} dBm</span>}
                        {r.snr         != null && <span>SNR {r.snr}</span>}
                        {r.extra?.temperature_c != null && <span>{r.extra.temperature_c}°C</span>}
                        <span style={{ color: hasGps ? '#22c55e' : T.textMuted }}>
                          {hasGps
                            ? `GPS ${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}`
                            : 'No GPS fix'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            /* ── List view ───────────────────────────────── */
            <>
              <div style={s.header}>
                <span style={s.title}>Devices</span>
                <button
                  onClick={() => api.getDevices().then(setDevices).catch(console.error)}
                  style={s.refreshBtn}
                  title="Refresh"
                >↻</button>
              </div>

              <div style={s.tabs}>
                {['unregistered', 'registered'].map((t) => {
                  const count = t === 'registered' ? registered.length : unregistered.length
                  return (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      style={{ ...s.tabBtn, ...(tab === t ? s.tabActive : {}) }}
                    >
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                      {count > 0 && <span style={s.badge}>{count}</span>}
                    </button>
                  )
                })}
              </div>

              <div style={s.list}>
                {currentList.length === 0 && (
                  <div style={{ ...s.muted, textAlign: 'center', padding: '16px 0' }}>
                    {tab === 'unregistered' ? 'No unregistered devices' : 'No registered devices'}
                  </div>
                )}
                {currentList.map((d) => {
                  const status = deviceStatus(d)
                  return (
                    <div key={d.id} style={s.deviceRow} onClick={() => handleSelect(d)}>
                      <span style={{ ...s.statusDot, background: STATUS_COLOR[status] }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={s.deviceName}>{d.name}</div>
                        <div style={s.deviceMeta}>
                          <span style={{ fontFamily: T.fontMono, fontSize: 10 }}>
                            {d.dev_eui?.slice(-8).toUpperCase()}
                          </span>
                          {d.last_seen_at && ` · ${timeAgo(d.last_seen_at)}`}
                          {d.last_battery_pct != null && ` · 🔋${d.last_battery_pct}%`}
                        </div>
                      </div>
                      <span style={s.chevron}>›</span>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

const s = {
  btn: {
    height: 30, padding: '0 10px',
    display: 'flex', alignItems: 'center', gap: 6,
    background: 'rgba(243,241,232,0.92)', backdropFilter: 'blur(10px)',
    border: '1px solid rgba(180,170,150,0.35)',
    borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
    cursor: 'pointer', fontSize: 14, color: T.textMuted,
    fontFamily: 'inherit', transition: 'all 0.15s', whiteSpace: 'nowrap',
  },
  btnActive: { background: 'rgba(243,241,232,0.98)', borderColor: 'rgba(180,170,150,0.6)' },
  panel: {
    position: 'absolute', bottom: 36, left: 0,
    width: 290, maxHeight: 520, overflowY: 'auto',
    background: 'rgba(243,241,232,0.97)', backdropFilter: 'blur(12px)',
    border: '1px solid rgba(180,170,150,0.4)',
    borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
    fontFamily: T.font,
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
    flex: 1, padding: '7px 8px',
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: 11, color: T.textMuted, fontFamily: 'inherit',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
    transition: 'all 0.15s', boxShadow: 'none',
  },
  tabActive: { color: T.text, boxShadow: `inset 0 -2px 0 ${T.text}` },
  badge:     { background: '#e5e1d0', borderRadius: 8, padding: '1px 5px', fontSize: 10, color: T.text },
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
}
