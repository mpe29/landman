import { useState, useEffect } from 'react'
import { T, C, PANEL_SHELL } from '../constants/theme'
import { api } from '../api'
import { PLATFORMS, getPlatform } from '../constants/platforms'

function timeAgo(dateStr) {
  if (!dateStr) return 'never'
  const s = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (s < 60)   return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function statusDot(lastMessageAt) {
  if (!lastMessageAt) return { color: T.textFaint, label: 'No data' }
  const age = Date.now() - new Date(lastMessageAt).getTime()
  if (age < 3600_000)   return { color: '#4caf50', label: 'Live' }
  if (age < 86400_000)  return { color: '#ff9800', label: 'Stale' }
  return { color: T.textFaint, label: 'Inactive' }
}

export default function IntegrationsPanel({ propertyId, isAdmin, onClose }) {
  const [integrations, setIntegrations] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('list') // 'list' | 'detail' | 'add'
  const [selectedPlatform, setSelectedPlatform] = useState(null)
  const [selectedIntegration, setSelectedIntegration] = useState(null)

  // Token reveal state (only shown once on create/rotate)
  const [revealedToken, setRevealedToken] = useState(null)
  const [revealedUrl, setRevealedUrl] = useState(null)

  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(null) // 'url' | 'token' | null

  const loadIntegrations = async () => {
    if (!propertyId) { setLoading(false); return }
    try {
      const data = await api.getIntegrations(propertyId)
      setIntegrations(data || [])
    } catch (err) {
      console.error('Failed to load integrations:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadIntegrations() }, [propertyId])

  const copy = (text, which) => {
    navigator.clipboard.writeText(text).catch(() => {})
    setCopied(which)
    setTimeout(() => setCopied(null), 2000)
  }

  const handleAddPlatform = (platform) => {
    setSelectedPlatform(platform)
    setView('add')
  }

  const handleCreate = async () => {
    setBusy(true)
    try {
      const result = await api.createIntegration({
        propertyId,
        platform: selectedPlatform.id,
        label: selectedPlatform.name,
      })
      setRevealedToken(result.token)
      setRevealedUrl(result.webhookUrl)
      await loadIntegrations()
      // Switch to detail view showing the new integration
      const updated = await api.getIntegrations(propertyId)
      const created = updated.find((i) => i.id === result.id)
      setSelectedIntegration(created)
      setView('detail')
    } catch (err) {
      alert(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleRotate = async () => {
    if (!confirm('Regenerate token? The current token will stop working immediately. You will need to update your webhook configuration.')) return
    setBusy(true)
    try {
      const result = await api.rotateIntegrationToken(selectedIntegration.id)
      setRevealedToken(result.token)
      setRevealedUrl(result.webhookUrl)
      await loadIntegrations()
      const updated = await api.getIntegrations(propertyId)
      setSelectedIntegration(updated.find((i) => i.id === selectedIntegration.id))
    } catch (err) {
      alert(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Delete this ${getPlatform(selectedIntegration.platform)?.name || ''} integration? Devices will remain but no new data will be received.`)) return
    setBusy(true)
    try {
      await api.deleteIntegration(selectedIntegration.id)
      setView('list')
      setSelectedIntegration(null)
      setRevealedToken(null)
      setRevealedUrl(null)
      await loadIntegrations()
    } catch (err) {
      alert(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleToggle = async () => {
    setBusy(true)
    try {
      await api.toggleIntegration(selectedIntegration.id, !selectedIntegration.enabled)
      await loadIntegrations()
      const updated = await api.getIntegrations(propertyId)
      setSelectedIntegration(updated.find((i) => i.id === selectedIntegration.id))
    } catch (err) {
      alert(err.message)
    } finally {
      setBusy(false)
    }
  }

  const openDetail = (integration) => {
    setSelectedIntegration(integration)
    setSelectedPlatform(getPlatform(integration.platform))
    setRevealedToken(null)
    setRevealedUrl(null)
    setView('detail')
  }

  // Build the webhook URL for display (even when token isn't revealed)
  const webhookUrlForIntegration = (integration) =>
    `https://scpcloowqevurdmuogio.supabase.co/functions/v1/ingest/${propertyId}/${integration.platform}`

  // Which platforms don't have an integration yet?
  const configuredPlatforms = new Set(integrations.map((i) => i.platform))
  const availablePlatforms = PLATFORMS.filter((p) => !configuredPlatforms.has(p.id))

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.panel} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={s.header}>
          {view !== 'list' && (
            <button style={s.backBtn} onClick={() => { setView('list'); setRevealedToken(null); setRevealedUrl(null) }}>
              &larr;
            </button>
          )}
          <span style={s.title}>
            {view === 'list' ? 'Integrations' : view === 'add' ? `Add ${selectedPlatform?.name}` : selectedPlatform?.name || 'Integration'}
          </span>
          <button style={s.closeBtn} onClick={onClose}>&times;</button>
        </div>

        <div style={s.content}>
          {/* ── LIST VIEW ─────────────────────────────────────── */}
          {view === 'list' && (
            loading ? (
              <div style={s.empty}>Loading...</div>
            ) : (
              <>
                {integrations.map((integ) => {
                  const platform = getPlatform(integ.platform)
                  const dot = statusDot(integ.last_message_at)
                  return (
                    <button
                      key={integ.id}
                      style={s.integrationRow}
                      onClick={() => openDetail(integ)}
                    >
                      <div style={s.rowLeft}>
                        <span style={s.platformIcon}>{platform?.icon || '\u{1F50C}'}</span>
                        <div>
                          <div style={s.platformName}>{platform?.name || integ.platform}</div>
                          <div style={s.rowMeta}>
                            {integ.label ? `${integ.label} \u00B7 ` : ''}
                            {integ.message_count.toLocaleString()} messages
                            {integ.last_message_at ? ` \u00B7 ${timeAgo(integ.last_message_at)}` : ''}
                          </div>
                        </div>
                      </div>
                      <div style={s.rowRight}>
                        <span style={{ ...s.statusDot, background: dot.color }} />
                        <span style={{ ...s.statusLabel, color: dot.color }}>{dot.label}</span>
                      </div>
                    </button>
                  )
                })}

                {/* Available platforms to add */}
                {isAdmin && availablePlatforms.length > 0 && (
                  <>
                    {integrations.length > 0 && <div style={s.divider} />}
                    <div style={s.sectionLabel}>Available Platforms</div>
                    {availablePlatforms.map((p) => (
                      <button
                        key={p.id}
                        style={s.integrationRow}
                        onClick={() => handleAddPlatform(p)}
                      >
                        <div style={s.rowLeft}>
                          <span style={s.platformIcon}>{p.icon}</span>
                          <div>
                            <div style={s.platformName}>{p.name}</div>
                            <div style={s.rowMeta}>{p.description}</div>
                          </div>
                        </div>
                        <span style={s.addIndicator}>+ Set up</span>
                      </button>
                    ))}
                  </>
                )}

                {integrations.length === 0 && !isAdmin && (
                  <div style={s.empty}>No integrations configured yet. Ask a property admin to set up device integrations.</div>
                )}
                {integrations.length === 0 && isAdmin && availablePlatforms.length === 0 && (
                  <div style={s.empty}>No platforms available</div>
                )}
              </>
            )
          )}

          {/* ── ADD VIEW (confirmation before creating) ──────── */}
          {view === 'add' && selectedPlatform && (
            <div style={s.addView}>
              <div style={s.platformHeader}>
                <span style={{ fontSize: 32 }}>{selectedPlatform.icon}</span>
                <div>
                  <div style={s.platformNameLg}>{selectedPlatform.name}</div>
                  <div style={s.platformDesc}>{selectedPlatform.description}</div>
                </div>
              </div>

              <p style={s.addInfo}>
                This will generate a unique webhook URL and authentication token for connecting
                your {selectedPlatform.name} account to this property. You&apos;ll be shown setup
                instructions after creation.
              </p>

              <button
                style={{ ...s.primaryBtn, opacity: busy ? 0.6 : 1 }}
                onClick={handleCreate}
                disabled={busy}
              >
                {busy ? 'Creating...' : `Create ${selectedPlatform.name} Integration`}
              </button>
            </div>
          )}

          {/* ── DETAIL VIEW ──────────────────────────────────── */}
          {view === 'detail' && selectedIntegration && selectedPlatform && (
            <div style={s.detailView}>
              {/* Status bar */}
              <div style={s.statusBar}>
                <div>
                  <span style={s.statusLabel2}>Status</span>
                  {(() => {
                    const dot = statusDot(selectedIntegration.last_message_at)
                    return (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ ...s.statusDot, background: selectedIntegration.enabled ? dot.color : T.textFaint }} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>
                          {!selectedIntegration.enabled ? 'Disabled' : dot.label}
                        </span>
                      </span>
                    )
                  })()}
                </div>
                <div>
                  <span style={s.statusLabel2}>Messages</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>
                    {selectedIntegration.message_count.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span style={s.statusLabel2}>Last received</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>
                    {selectedIntegration.last_message_at ? timeAgo(selectedIntegration.last_message_at) : 'Never'}
                  </span>
                </div>
              </div>

              {/* Webhook URL */}
              <div style={s.fieldGroup}>
                <div style={s.fieldLabel}>Webhook URL</div>
                <div style={s.fieldBox}>
                  <span style={s.fieldValue}>
                    {revealedUrl || webhookUrlForIntegration(selectedIntegration)}
                  </span>
                  <button
                    style={s.copyBtn}
                    onClick={() => copy(revealedUrl || webhookUrlForIntegration(selectedIntegration), 'url')}
                  >
                    {copied === 'url' ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              {/* Auth Token */}
              <div style={s.fieldGroup}>
                <div style={s.fieldLabel}>Auth Token</div>
                <div style={s.fieldBox}>
                  {revealedToken ? (
                    <span style={{ ...s.fieldValue, fontWeight: 600, color: C.deepOlive }}>
                      {revealedToken}
                    </span>
                  ) : (
                    <span style={{ ...s.fieldValue, color: T.textMuted }}>
                      {selectedIntegration.webhook_token_prefix}{'••••••••'}
                    </span>
                  )}
                  {revealedToken && (
                    <button style={s.copyBtn} onClick={() => copy(revealedToken, 'token')}>
                      {copied === 'token' ? 'Copied' : 'Copy'}
                    </button>
                  )}
                </div>
                {revealedToken && (
                  <div style={s.fieldHint}>
                    Save this token now — it won&apos;t be shown again.
                  </div>
                )}
                {!revealedToken && isAdmin && (
                  <button
                    style={{ ...s.secondaryBtn, marginTop: 6 }}
                    onClick={handleRotate}
                    disabled={busy}
                  >
                    {busy ? 'Regenerating...' : 'Regenerate Token'}
                  </button>
                )}
              </div>

              {/* Setup instructions */}
              <div style={s.fieldGroup}>
                <div style={s.fieldLabel}>Setup Instructions</div>
                <div style={s.instructionBox}>
                  {selectedPlatform.steps.map((step, i) => (
                    <div key={i} style={s.step}>
                      <span style={s.stepNum}>{i + 1}</span>
                      <span style={s.stepText}>{step.replace('{token}', revealedToken || `${selectedIntegration.webhook_token_prefix}...`)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Admin actions */}
              {isAdmin && (
                <div style={s.adminActions}>
                  <button
                    style={s.secondaryBtn}
                    onClick={handleToggle}
                    disabled={busy}
                  >
                    {selectedIntegration.enabled ? 'Disable' : 'Enable'} Integration
                  </button>
                  <button
                    style={s.dangerBtn}
                    onClick={handleDelete}
                    disabled={busy}
                  >
                    Delete Integration
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const s = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 9000,
    background: 'rgba(0,0,0,0.35)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  panel: {
    ...PANEL_SHELL,
    width: '94%', maxWidth: 480, maxHeight: '85vh',
    display: 'flex', flexDirection: 'column',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 18px', borderBottom: `1px solid ${T.surfaceBorder}`,
    gap: 8,
  },
  title: {
    fontSize: 14, fontWeight: 700, color: C.deepOlive,
    letterSpacing: '0.08em', flex: 1,
  },
  closeBtn: {
    background: 'none', border: 'none', fontSize: 20,
    color: T.textMuted, cursor: 'pointer', fontFamily: 'inherit',
    lineHeight: 1, padding: 0,
  },
  backBtn: {
    background: 'none', border: 'none', fontSize: 16,
    color: T.textMuted, cursor: 'pointer', fontFamily: 'inherit',
    padding: '0 4px 0 0',
  },
  content: {
    flex: 1, overflowY: 'auto', padding: '8px 0',
  },
  empty: {
    textAlign: 'center', color: T.textMuted, fontSize: 13, padding: 24,
  },

  // List view
  integrationRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    width: '100%', padding: '12px 18px', background: 'transparent',
    border: 'none', borderBottom: `1px solid ${T.surfaceBorder}`,
    cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
  },
  rowLeft: {
    display: 'flex', alignItems: 'center', gap: 12, flex: 1,
  },
  platformIcon: {
    fontSize: 22, flexShrink: 0,
  },
  platformName: {
    fontSize: 13, fontWeight: 600, color: T.text,
  },
  rowMeta: {
    fontSize: 11, color: T.textMuted, marginTop: 2,
  },
  rowRight: {
    display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
  },
  statusDot: {
    width: 8, height: 8, borderRadius: '50%', display: 'inline-block',
  },
  statusLabel: {
    fontSize: 11, fontWeight: 600,
  },
  addIndicator: {
    fontSize: 11, fontWeight: 600, color: C.deepOlive,
    padding: '4px 10px', background: T.brandBg,
    border: `1px solid ${T.brandBorder}`, borderRadius: 4,
    flexShrink: 0,
  },
  divider: {
    height: 1, background: T.surfaceBorder, margin: '4px 0',
  },
  sectionLabel: {
    fontSize: 10, fontWeight: 700, color: T.textFaint,
    letterSpacing: '0.12em', padding: '12px 18px 4px',
  },

  // Add view
  addView: {
    padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16,
  },
  platformHeader: {
    display: 'flex', alignItems: 'center', gap: 14,
  },
  platformNameLg: {
    fontSize: 16, fontWeight: 700, color: C.deepOlive,
  },
  platformDesc: {
    fontSize: 12, color: T.textMuted, marginTop: 2,
  },
  addInfo: {
    fontSize: 13, color: T.textMuted, lineHeight: 1.5, margin: 0,
  },

  // Detail view
  detailView: {
    padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 16,
  },
  statusBar: {
    display: 'flex', justifyContent: 'space-between',
    padding: '12px 14px', background: T.brandBg,
    borderRadius: 8, border: `1px solid ${T.brandBorder}`,
  },
  statusLabel2: {
    display: 'block', fontSize: 10, fontWeight: 600, color: T.textMuted,
    letterSpacing: '0.06em', marginBottom: 4,
  },
  fieldGroup: {
    display: 'flex', flexDirection: 'column', gap: 4,
  },
  fieldLabel: {
    fontSize: 11, fontWeight: 700, color: T.textMuted,
    letterSpacing: '0.06em',
  },
  fieldBox: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 10px', background: '#fff',
    border: `1px solid ${T.surfaceBorder}`, borderRadius: 6,
  },
  fieldValue: {
    flex: 1, fontSize: 11, color: T.text,
    wordBreak: 'break-all', fontFamily: 'monospace',
  },
  fieldHint: {
    fontSize: 11, color: '#d97706', fontWeight: 500,
  },
  copyBtn: {
    padding: '3px 8px', fontSize: 10, fontWeight: 600,
    background: T.brandBg, color: C.deepOlive,
    border: `1px solid ${T.brandBorder}`, borderRadius: 4,
    cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
  },

  // Instructions
  instructionBox: {
    display: 'flex', flexDirection: 'column', gap: 6,
    padding: '10px 12px', background: '#fafaf8',
    border: `1px solid ${T.surfaceBorder}`, borderRadius: 6,
  },
  step: {
    display: 'flex', gap: 8, alignItems: 'flex-start',
  },
  stepNum: {
    width: 18, height: 18, borderRadius: '50%',
    background: C.deepOlive + '18', color: C.deepOlive,
    fontSize: 10, fontWeight: 700, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },
  stepText: {
    fontSize: 12, color: T.text, lineHeight: 1.5, whiteSpace: 'pre-wrap',
  },

  // Buttons
  primaryBtn: {
    padding: '10px 0', background: C.deepOlive, color: C.panelBg,
    border: 'none', borderRadius: 8, cursor: 'pointer',
    fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
  },
  secondaryBtn: {
    padding: '6px 12px', fontSize: 11, fontWeight: 600,
    background: T.brandBg, color: C.deepOlive,
    border: `1px solid ${T.brandBorder}`, borderRadius: 4,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  dangerBtn: {
    padding: '6px 12px', fontSize: 11, fontWeight: 600,
    background: T.dangerBg, color: T.danger,
    border: `1px solid ${T.dangerBorder}`, borderRadius: 4,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  adminActions: {
    display: 'flex', gap: 8, paddingTop: 8,
    borderTop: `1px solid ${T.surfaceBorder}`,
  },
}
