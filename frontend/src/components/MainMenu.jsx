import { useEffect, useRef } from 'react'
import { T } from '../constants/theme'

const MENU_ITEMS = [
  { id: 'profile',      label: 'Profile' },
  { id: 'settings',     label: 'Settings' },
  { id: 'integrations', label: 'Integrations' },
  { divider: true },
  { id: 'help',         label: 'Help' },
  { id: 'logout',       label: 'Log Out' },
]

export default function MainMenu({ isOpen, onOpen }) {
  const ref = useRef(null)

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return
    const handler = (e) => { if (!ref.current?.contains(e.target)) onOpen() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={ref} style={s.wrap}>
      <button style={s.trigger} onClick={onOpen}>
        <span style={s.logo}>LANDMAN</span>
        <span style={{ ...s.chevron, transform: isOpen ? 'rotate(180deg)' : 'none' }}>▾</span>
      </button>

      {isOpen && (
        <div style={s.dropdown}>
          {MENU_ITEMS.map((item, i) =>
            item.divider
              ? <div key={i} style={s.divider} />
              : (
                <button key={item.id} style={s.item} onClick={onOpen}>
                  {item.label}
                </button>
              )
          )}
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
    padding: '7px 12px', boxShadow: T.surfaceShadow,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  logo: {
    color: T.brand, fontFamily: "'Exo 2', sans-serif",
    fontWeight: 800, fontSize: 13, letterSpacing: '0.14em',
  },
  chevron: {
    color: T.textFaint, fontSize: 10,
    transition: 'transform 0.15s', display: 'inline-block',
  },
  dropdown: {
    position: 'absolute', top: 'calc(100% + 6px)', left: 0,
    background: T.surface, backdropFilter: 'blur(10px)',
    border: `1px solid ${T.surfaceBorder}`, borderRadius: 10,
    boxShadow: T.surfaceShadow, minWidth: 180, overflow: 'hidden',
  },
  item: {
    display: 'block', width: '100%', padding: '9px 16px',
    background: 'transparent', border: 'none',
    color: T.textMuted, fontSize: 13, fontWeight: 500, textAlign: 'left',
    cursor: 'pointer', fontFamily: 'inherit',
  },
  divider: {
    height: 1, background: T.surfaceBorder, margin: '3px 0',
  },
}
