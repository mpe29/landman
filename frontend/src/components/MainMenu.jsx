import { useEffect, useRef } from 'react'
import { T, C } from '../constants/theme'

function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return parts[0][0].toUpperCase()
}

const MENU_ITEMS = [
  { id: 'profile',      label: 'Profile' },
  { id: 'settings',     label: 'Settings' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'users',        label: 'User Management', adminOnly: true },
  { divider: true },
  { id: 'help',         label: 'Help' },
  { id: 'logout',       label: 'Log Out' },
]

export default function MainMenu({ isOpen, onOpen, onLogout, isAdmin, pendingCount, onUserManagement, onProfile, userName }) {
  const ref = useRef(null)

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return
    const handler = (e) => { if (!ref.current?.contains(e.target)) onOpen() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleItemClick = (item) => {
    if (item.id === 'logout')  { onLogout?.(); return }
    if (item.id === 'users')   { onUserManagement?.(); return }
    if (item.id === 'profile') { onProfile?.(); return }
    onOpen() // close menu for unimplemented items
  }

  const initials = getInitials(userName)

  return (
    <div ref={ref} style={s.wrap}>
      <button style={s.trigger} onClick={onOpen}>
        <span style={s.logo}>LANDMAN</span>
        <span style={s.avatar}>{initials}</span>
        {pendingCount > 0 && <span style={s.badge}>{pendingCount}</span>}
      </button>

      {isOpen && (
        <div style={s.dropdown}>
          {userName && (
            <>
              <div style={s.userInfo}>
                <span style={s.userName}>{userName}</span>
              </div>
              <div style={s.divider} />
            </>
          )}
          {MENU_ITEMS.map((item, i) => {
            if (item.divider) return <div key={i} style={s.divider} />
            if (item.adminOnly && !isAdmin) return null
            return (
              <button key={item.id} style={s.item} onClick={() => handleItemClick(item)}>
                {item.label}
                {item.id === 'users' && pendingCount > 0 && (
                  <span style={s.menuBadge}>{pendingCount}</span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

const s = {
  wrap: {
    position: 'absolute', top: 16, left: 16, zIndex: 10,
  },
  trigger: {
    display: 'flex', alignItems: 'center', gap: 7,
    background: T.surface, backdropFilter: 'blur(10px)',
    border: `1px solid ${T.surfaceBorder}`, borderRadius: 8,
    padding: '5px 8px', boxShadow: T.surfaceShadow,
    cursor: 'pointer', fontFamily: 'inherit',
    position: 'relative',
  },
  avatar: {
    width: 26, height: 26,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: C.deepOlive + '18',
    border: `1px solid ${C.deepOlive}55`,
    borderRadius: 8, flexShrink: 0,
    fontSize: 10, fontWeight: 700, letterSpacing: '0.02em',
    color: C.deepOlive, fontFamily: 'inherit',
  },
  logo: {
    color: T.brand, fontFamily: "'Exo 2', sans-serif",
    fontWeight: 800, fontSize: 13, letterSpacing: '0.14em',
  },
  chevron: {
    color: T.textFaint, fontSize: 10,
    transition: 'transform 0.15s', display: 'inline-block',
  },
  badge: {
    position: 'absolute', top: -5, right: -5,
    minWidth: 16, height: 16, borderRadius: 8,
    background: T.danger, color: '#fff',
    fontSize: 9, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '0 4px',
  },
  dropdown: {
    position: 'absolute', top: 'calc(100% + 6px)', left: 0,
    background: T.surface, backdropFilter: 'blur(10px)',
    border: `1px solid ${T.surfaceBorder}`, borderRadius: 10,
    boxShadow: T.surfaceShadow, minWidth: 180, overflow: 'hidden',
  },
  userInfo: {
    display: 'flex', alignItems: 'center',
    padding: '7px 12px',
  },
  avatarLg: {
    width: 32, height: 32,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: C.deepOlive + '18',
    border: `1px solid ${C.deepOlive}55`,
    borderRadius: 8, flexShrink: 0,
    fontSize: 12, fontWeight: 700, letterSpacing: '0.02em',
    color: C.deepOlive, fontFamily: 'inherit',
  },
  userName: {
    fontSize: 13, fontWeight: 600, color: T.text,
    fontFamily: 'inherit',
  },
  item: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    width: '100%', padding: '6px 12px',
    background: 'transparent', border: 'none',
    color: T.textMuted, fontSize: 13, fontWeight: 500, textAlign: 'left',
    cursor: 'pointer', fontFamily: 'inherit',
  },
  menuBadge: {
    minWidth: 16, height: 16, borderRadius: 8,
    background: T.danger, color: '#fff',
    fontSize: 9, fontWeight: 700,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: '0 4px',
  },
  divider: {
    height: 1, background: T.surfaceBorder, margin: '3px 0',
  },
}
