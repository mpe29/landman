# LANDMAN UI Patterns Reference

Single source of truth for visual and interaction patterns used throughout the app.
Update this when introducing new patterns so every component stays consistent.

---

## Colour Tokens (`frontend/src/constants/theme.js`)

| Token | Usage |
|-------|-------|
| `T.surface` | Panel background (warm off-white `#F3F1E8`) |
| `T.surfaceBorder` | Borders and subtle dividers |
| `T.surfaceShadow` | Standard `box-shadow` for floating elements |
| `T.text` | Primary text (`#2F2F2F`) |
| `T.textMuted` | Secondary / label text (50% charcoal) |
| `T.textFaint` | Placeholder, meta, timestamps (32% charcoal) |
| `T.textOnDark` | Text placed on a dark/accent background |
| `T.brand` | Brand accent (`#4E5B3C` deep olive) — use sparingly for CTAs |
| `T.brandBorder` | Border for brand-coloured buttons |
| `T.brandBg` | Light background tint for brand buttons |
| `T.danger` | Destructive action text (`#b91c1c`) |
| `T.dangerBorder` | Destructive action border |
| `T.dangerBg` | Destructive action background tint |
| `T.font` | Default font family (Exo 2) |
| `T.fontMono` | Monospace — EUI codes, coordinates |

Area / level accent colours come from `C` (palette) in the same file:
`C.pistachioGreen`, `C.dryGrassYellow`, `C.dustyBlue`, `C.burntOrange`.

---

## Bottom-Left Panel Stack

All panels live in `App.jsx`'s `stackStyle` container.
**Rule: only one panel is open at a time** — controlled by `openPanel` string state + `handlePanelOpen(id)` toggle.

```jsx
// App.jsx pattern — every panel receives these two props:
<SomePanel
  isOpen={openPanel === 'panelId'}
  onOpen={() => handlePanelOpen('panelId')}
/>
```

### REQUIRED: Use shared shell constants — never re-declare locally

```js
import { T, PANEL_SHELL, PANEL_HEADER, PANEL_TITLE, PANEL_CHEVRON } from '../constants/theme'
```

| Constant | What it styles |
|----------|---------------|
| `PANEL_SHELL` | Outer `<div>` — background, border, border-radius, shadow, `overflow: hidden` |
| `PANEL_HEADER` | The trigger `<button>` — transparent bg, no border, correct padding (`9px 14px`) |
| `PANEL_TITLE` | `<span>` label — 10px, weight 700, letter-spacing 0.12em, `T.textFaint` |
| `PANEL_CHEVRON` | `<span>` arrow — 11px, `T.textFaint` |

### Canonical panel structure (copy this exactly)

```jsx
export default function MyPanel({ isOpen, onOpen }) {
  return (
    <div style={PANEL_SHELL}>
      <button style={PANEL_HEADER} onClick={onOpen}>
        <span style={PANEL_TITLE}>LABEL</span>
        <span style={PANEL_CHEVRON}>{isOpen ? '▾' : '▸'}</span>
      </button>

      {isOpen && (
        <div style={{ borderTop: `1px solid ${T.surfaceBorder}`, maxHeight: 480, overflowY: 'auto' }}>
          {/* panel content */}
        </div>
      )}
    </div>
  )
}
```

**Rules — no exceptions:**
- Label is **ALL CAPS** only
- Chevron: `▸` (closed) → `▾` (open), never rotation transforms
- The `<button>` must have `background: transparent, border: none` — visual styling lives on the wrapper `<div>`
- **Never** put `background`, `border`, `borderRadius`, or `boxShadow` directly on the trigger button

---

## Right-Side Feature Panel (`FeaturePanel.jsx`)

Opens when the user clicks any map feature.
Position: `top: 16, right: 16, bottom: 16, width: 290`.
Accent colour comes from the feature type (area level or point type colour).

Structure:
1. **Header** — left colour bar, badge (type label), meta line, close ✕
2. **Photo** (observations only)
3. **Fields** — scrollable, flex column, gap 12
4. **Actions** — Save / Delete at the bottom, `flexShrink: 0`

Device features bypass the standard form and render `DeviceFeaturePanel` (read-only).

---

## Status Dots (Devices & GPS)

| Status | Colour | Behaviour |
|--------|--------|-----------|
| GPS location | `#3b82f6` blue | CSS pulse animation |
| Device `fresh` — seen < 2 h | `#22c55e` green | CSS pulse animation |
| Device `stale` — seen > 2 h | `#f59e0b` amber | Static dot |
| Device `inactive` — not registered | `#9ca3af` grey | Static, smaller shadow |

All dots: `width/height: 16px`, `border: 2.5px solid #fff`, `border-radius: 50%`.
Pulse keyframe (swap the rgba colour per status):

```css
@keyframes device-pulse {
  0%   { box-shadow: 0 0 0 0   rgba(34,197,94,0.55), 0 1px 4px rgba(0,0,0,0.35); }
  70%  { box-shadow: 0 0 0 14px rgba(34,197,94,0),   0 1px 4px rgba(0,0,0,0.35); }
  100% { box-shadow: 0 0 0 0   rgba(34,197,94,0),    0 1px 4px rgba(0,0,0,0.35); }
}
```

---

## Section Headers (inside panels)

Used for livestock, tags, readings log headings:

```js
{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.textMuted }
```

Pair with a small action button (e.g. "+ Add"):

```js
{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 5,
  border: `1.5px solid ${T.brandBorder}`, background: T.brandBg,
  color: T.brand, cursor: 'pointer', fontFamily: 'inherit' }
```

---

## Form Inputs

Standard text / select inside panels:

```js
// Input
{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', fontSize: 13,
  background: T.surfaceBorder, border: `1px solid ${T.surfaceBorder}`,
  borderRadius: 6, color: T.text, fontFamily: 'inherit', outline: 'none' }

// Label
{ display: 'flex', flexDirection: 'column', gap: 5,
  color: T.textMuted, fontSize: 11, fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.07em' }
```

---

## Tabs

Use `boxShadow: 'inset 0 -2px 0 <color>'` for the active underline —
**never `borderBottom`** on a flex child (causes React style conflicts).

```js
// Base tab button
{ flex: 1, padding: '7px 8px', background: 'none', border: 'none', cursor: 'pointer',
  fontSize: 11, color: T.textMuted, fontFamily: 'inherit',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
  transition: 'all 0.15s', boxShadow: 'none' }

// Active state (spread over base)
{ color: T.text, boxShadow: `inset 0 -2px 0 ${T.text}` }
```

---

## Delete Confirmation Pattern

Two-step delete used in FeaturePanel:

1. First click → show confirm row
2. 2-second safety delay (`setTimeout`) before "Yes, delete" activates
3. Cancel resets everything

```jsx
{!confirmDelete
  ? <button onClick={() => setConfirmDelete(true)}>Delete</button>
  : <div>
      <span>{deleteReady ? 'Ready — click to confirm.' : 'Hold on… (2s safety delay)'}</span>
      <button disabled={!deleteReady} onClick={handleDelete}>Yes, delete</button>
      <button onClick={() => setConfirmDelete(false)}>Cancel</button>
    </div>
}
```

---

## Map Layers (`frontend/src/constants/layers.js`)

| `type` | Mapbox rendering | Click handling |
|--------|-----------------|---------------|
| `polygon` | fill + outline | `map.on('click', id-fill)` |
| `point` | circle | `map.on('click', id-circle)` |
| `line` | line | — |
| `symbol` | text label | — (no featureType) |
| `html_marker` | DOM element via `mapboxgl.Marker` | element `click` listener |

`featureType` is passed to `onFeatureClick` and used by `FeaturePanel` to select the correct view.

---

## Adding a New Panel

1. Create `components/MyPanel.jsx`
2. Import `PANEL_SHELL, PANEL_HEADER, PANEL_TITLE, PANEL_CHEVRON` from `constants/theme`
3. Use the **canonical panel structure** above — copy it exactly
4. In `App.jsx`: add `<MyPanel isOpen={openPanel === 'mypanel'} onOpen={() => handlePanelOpen('mypanel')} />` inside `stackStyle`
5. `handlePanelOpen` automatically closes any other open panel — nothing extra needed
