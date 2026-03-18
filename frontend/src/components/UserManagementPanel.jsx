import { useState, useEffect } from 'react'
import { T, C, PANEL_SHELL } from '../constants/theme'
import { api } from '../api'

const ROLES = ['manager', 'staff', 'contractor']

export default function UserManagementPanel({ propertyId, onClose, onViewProfile, currentUserId }) {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('members') // 'members' | 'add'

  // Add user form
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState('staff')
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState(null) // { pin, joinToken }

  const loadMembers = async () => {
    try {
      const data = await api.getPropertyMembers(propertyId)
      setMembers(data)
    } catch (err) {
      console.error('Failed to load members:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadMembers() }, [propertyId])

  const handleCreate = async (e) => {
    e.preventDefault()
    setCreating(true)
    try {
      const result = await api.createMember({
        propertyId,
        fullName: newName,
        role: newRole,
      })
      setCreated(result)
      setNewName('')
      setNewRole('staff')
      loadMembers()
    } catch (err) {
      alert(err.message)
    } finally {
      setCreating(false)
    }
  }

  const handleResetPin = async (member) => {
    try {
      const { pin } = await api.updatePin(member.id)
      alert(`New PIN for ${member.profiles?.full_name || 'user'}: ${pin}`)
      loadMembers()
    } catch (err) {
      alert(err.message)
    }
  }

  const handleRoleChange = async (member, role) => {
    try {
      await api.updateMemberRole(member.id, role)
      loadMembers()
    } catch (err) {
      alert(err.message)
    }
  }

  const handleToggleAdmin = async (member) => {
    try {
      await api.updateMemberRole(member.id, undefined, !member.is_admin)
      loadMembers()
    } catch (err) {
      alert(err.message)
    }
  }

  const handleRemove = async (member) => {
    const name = member.profiles?.full_name || 'this user'
    if (!confirm(`Remove ${name} from this property?`)) return
    try {
      await api.removeMember(member.id)
      loadMembers()
    } catch (err) {
      alert(err.message)
    }
  }

  const joinUrl = created
    ? `${window.location.origin}${window.location.pathname}#/join/${created.joinToken}`
    : ''

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).catch(() => {})
  }

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.panel} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={s.header}>
          <span style={s.title}>User Management</span>
          <button style={s.closeBtn} onClick={onClose}>&times;</button>
        </div>

        {/* Tabs */}
        <div style={s.tabs}>
          <button
            style={{ ...s.tab, ...(tab === 'members' ? s.tabActive : {}) }}
            onClick={() => { setTab('members'); setCreated(null) }}
          >
            Members
          </button>
          <button
            style={{ ...s.tab, ...(tab === 'add' ? s.tabActive : {}) }}
            onClick={() => setTab('add')}
          >
            + Add User
          </button>
        </div>

        {/* Content */}
        <div style={s.content}>
          {tab === 'members' && (
            loading ? (
              <div style={s.empty}>Loading...</div>
            ) : members.length === 0 ? (
              <div style={s.empty}>No members yet</div>
            ) : (
              members.map((m) => (
                <div key={m.id} style={s.memberRow}>
                  <div style={s.memberInfo}>
                    <div
                      style={{ ...s.memberName, cursor: 'pointer' }}
                      onClick={() => {
                        const isSelf = m.user_id === currentUserId
                        onViewProfile?.(m.user_id, isSelf)
                      }}
                    >
                      {m.profiles?.full_name || m.profiles?.email || '—'}
                      {m.is_admin && <span style={s.adminBadge}>Admin</span>}
                    </div>
                    <div style={s.memberMeta}>
                      {m.role}
                      {m.pin && <> &middot; PIN: <strong>{m.pin}</strong></>}
                      {m.status === 'pending' && <span style={s.pendingBadge}>Pending</span>}
                    </div>
                  </div>
                  {m.role !== 'owner' && (
                    <div style={s.memberActions}>
                      <select
                        value={m.role}
                        onChange={(e) => handleRoleChange(m, e.target.value)}
                        style={s.roleSelect}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                      {m.role === 'manager' && (
                        <button
                          style={s.actionBtn}
                          onClick={() => handleToggleAdmin(m)}
                          title={m.is_admin ? 'Remove admin' : 'Grant admin'}
                        >
                          {m.is_admin ? 'Revoke Admin' : 'Make Admin'}
                        </button>
                      )}
                      {m.pin && (
                        <button style={s.actionBtn} onClick={() => handleResetPin(m)}>
                          Reset PIN
                        </button>
                      )}
                      {m.join_token && (
                        <button
                          style={s.actionBtn}
                          onClick={() => {
                            const url = `${window.location.origin}${window.location.pathname}#/join/${m.join_token}`
                            copyToClipboard(url)
                            alert('Join link copied!')
                          }}
                        >
                          Copy Link
                        </button>
                      )}
                      <button style={s.removeBtn} onClick={() => handleRemove(m)}>
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              ))
            )
          )}

          {tab === 'add' && !created && (
            <form onSubmit={handleCreate} style={s.addForm}>
              <input
                type="text"
                placeholder="Full Name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                style={s.input}
                required
              />
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                style={s.input}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                ))}
              </select>
              <button type="submit" style={s.createBtn} disabled={creating}>
                {creating ? 'Creating...' : 'Create User'}
              </button>
            </form>
          )}

          {tab === 'add' && created && (
            <div style={s.createdBox}>
              <div style={s.createdTitle}>User created!</div>
              <div style={s.createdRow}>
                <span style={s.createdLabel}>Name:</span>
                <span>{created.fullName}</span>
              </div>
              <div style={s.createdRow}>
                <span style={s.createdLabel}>Role:</span>
                <span>{created.role}</span>
              </div>
              <div style={s.createdRow}>
                <span style={s.createdLabel}>PIN:</span>
                <span style={s.pinDisplay}>{created.pin}</span>
                <button style={s.copyBtn} onClick={() => copyToClipboard(created.pin)}>Copy</button>
              </div>
              <div style={{ ...s.createdRow, flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
                <span style={s.createdLabel}>Join Link:</span>
                <div style={s.linkBox}>
                  <span style={s.linkText}>{joinUrl}</span>
                  <button style={s.copyBtn} onClick={() => copyToClipboard(joinUrl)}>Copy</button>
                </div>
              </div>
              <button
                style={{ ...s.createBtn, marginTop: 16 }}
                onClick={() => setCreated(null)}
              >
                Add Another User
              </button>
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
  },
  title: {
    fontSize: 14, fontWeight: 700, color: C.deepOlive,
    letterSpacing: '0.08em',
  },
  closeBtn: {
    background: 'none', border: 'none', fontSize: 20,
    color: T.textMuted, cursor: 'pointer', fontFamily: 'inherit',
    lineHeight: 1, padding: 0,
  },
  tabs: {
    display: 'flex', borderBottom: `1px solid ${T.surfaceBorder}`,
  },
  tab: {
    flex: 1, padding: '10px 0', background: 'none', border: 'none',
    fontSize: 12, fontWeight: 600, color: T.textMuted,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  tabActive: {
    color: C.deepOlive,
    borderBottom: `2px solid ${C.deepOlive}`,
  },
  content: {
    flex: 1, overflowY: 'auto', padding: '12px 16px',
  },
  empty: {
    textAlign: 'center', color: T.textMuted, fontSize: 13, padding: 24,
  },
  memberRow: {
    padding: '10px 0',
    borderBottom: `1px solid ${T.surfaceBorder}`,
  },
  memberInfo: {
    marginBottom: 6,
  },
  memberName: {
    fontSize: 14, fontWeight: 600, color: T.text,
    display: 'flex', alignItems: 'center', gap: 8,
  },
  memberMeta: {
    fontSize: 11, color: T.textMuted, marginTop: 2,
  },
  adminBadge: {
    fontSize: 9, fontWeight: 700, color: C.deepOlive,
    background: C.deepOlive + '18', padding: '2px 6px',
    borderRadius: 4, letterSpacing: '0.06em',
  },
  pendingBadge: {
    fontSize: 9, fontWeight: 700, color: T.warn,
    background: T.warnBg, padding: '2px 6px', borderRadius: 4,
    marginLeft: 6,
  },
  memberActions: {
    display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6,
  },
  roleSelect: {
    padding: '4px 8px', fontSize: 11, borderRadius: 4,
    border: `1px solid ${T.surfaceBorder}`, fontFamily: 'inherit',
    background: '#fff', color: T.text,
  },
  actionBtn: {
    padding: '4px 10px', fontSize: 10, fontWeight: 600,
    background: T.brandBg, color: C.deepOlive,
    border: `1px solid ${T.brandBorder}`, borderRadius: 4,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  removeBtn: {
    padding: '4px 10px', fontSize: 10, fontWeight: 600,
    background: T.dangerBg, color: T.danger,
    border: `1px solid ${T.dangerBorder}`, borderRadius: 4,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  addForm: {
    display: 'flex', flexDirection: 'column', gap: 12, padding: '8px 0',
  },
  input: {
    width: '100%', padding: '10px 12px',
    border: `1px solid ${T.surfaceBorder}`, borderRadius: 8,
    fontSize: 14, fontFamily: 'inherit', outline: 'none',
    background: '#fff', color: T.text, boxSizing: 'border-box',
  },
  createBtn: {
    padding: '10px 0', background: C.deepOlive, color: C.panelBg,
    border: 'none', borderRadius: 8, cursor: 'pointer',
    fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
  },
  createdBox: {
    padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 10,
  },
  createdTitle: {
    fontSize: 16, fontWeight: 700, color: C.deepOlive, marginBottom: 4,
  },
  createdRow: {
    display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
  },
  createdLabel: {
    color: T.textMuted, fontWeight: 600, minWidth: 48,
  },
  pinDisplay: {
    fontSize: 22, fontWeight: 800, letterSpacing: '0.2em',
    color: C.deepOlive, fontFamily: "'Exo 2', sans-serif",
  },
  copyBtn: {
    padding: '3px 8px', fontSize: 10, fontWeight: 600,
    background: T.brandBg, color: C.deepOlive,
    border: `1px solid ${T.brandBorder}`, borderRadius: 4,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  linkBox: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 10px', background: '#fff',
    border: `1px solid ${T.surfaceBorder}`, borderRadius: 6,
    width: '100%', boxSizing: 'border-box',
  },
  linkText: {
    flex: 1, fontSize: 11, color: T.textMuted,
    wordBreak: 'break-all', fontFamily: 'monospace',
  },
}
