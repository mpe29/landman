import { useState, useMemo } from 'react'
import { isFilterActive, DEFAULT_OBS_FILTER, getObservationYears } from '../utils/obsFilter'
import { T, C } from '../constants/theme'

// Southern-hemisphere seasons
const SEASONS = [
  { label: 'Summer', months: [12, 1, 2],  color: '#C46A2D' },
  { label: 'Autumn', months: [3,  4, 5],  color: '#D4B646' },
  { label: 'Winter', months: [6,  7, 8],  color: '#4C7A8C' },
  { label: 'Spring', months: [9, 10, 11], color: '#8FAF7A' },
]
const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// Default palette for new custom tag types — aligned with brand colours
const TAG_COLORS = ['#4E5B3C','#C46A2D','#4C7A8C','#D4B646','#8FAF7A','#7c3aed','#b91c1c','#94a3b8']
const TAG_EMOJIS = ['📌','🌿','🐄','🦁','🌱','💧','🏗️','🌧️','🚧','⭐','🔴','📷']

function loadCollapsed() {
  try { return JSON.parse(localStorage.getItem('landman_obs_panel')) ?? false } catch { return false }
}

export default function ObservationFilterPanel({
  observations,    // ALL (unfiltered) — used for year derivation and total count
  tagTypes,        // [{ id, name, emoji, color }]
  filter,
  onChange,
  onAddTagType,    // (name, emoji, color) => Promise<void>
  filteredCount,
  heatmap,
  onHeatmapToggle,
}) {
  const [collapsed, setCollapsedRaw] = useState(loadCollapsed)
  const [addingTag, setAddingTag]     = useState(false)
  const [newName,   setNewName]       = useState('')
  const [newEmoji,  setNewEmoji]      = useState('📌')
  const [newColor,  setNewColor]      = useState(TAG_COLORS[0])

  const setCollapsed = (v) => {
    setCollapsedRaw(v)
    try { localStorage.setItem('landman_obs_panel', JSON.stringify(v)) } catch {}
  }

  const totalCount    = observations.length
  const active        = isFilterActive(filter)
  const selectedYears = filter.years  || []
  const selectedMonths= filter.months || []
  const selectedTags  = filter.tagIds || []

  const availableYears = useMemo(() => getObservationYears(observations), [observations])

  // ── toggle helpers ───────────────────────────────────────────
  const toggleYear = (yr) => {
    const next = selectedYears.includes(yr)
      ? selectedYears.filter((y) => y !== yr)
      : [...selectedYears, yr]
    onChange({ ...filter, years: next.length ? next : null })
  }

  const toggleMonth = (m) => {
    const next = selectedMonths.includes(m)
      ? selectedMonths.filter((x) => x !== m)
      : [...selectedMonths, m]
    onChange({ ...filter, months: next.length ? next : null })
  }

  const toggleSeason = (months) => {
    const allOn = months.every((m) => selectedMonths.includes(m))
    const next  = allOn
      ? selectedMonths.filter((m) => !months.includes(m))
      : [...new Set([...selectedMonths, ...months])]
    onChange({ ...filter, months: next.length ? next : null })
  }

  const toggleTag = (id) => {
    const next = selectedTags.includes(id)
      ? selectedTags.filter((x) => x !== id)
      : [...selectedTags, id]
    onChange({ ...filter, tagIds: next })
  }

  const clearAll = () => onChange(DEFAULT_OBS_FILTER)

  const saveNewTag = async () => {
    if (!newName.trim()) return
    await onAddTagType(newName.trim(), newEmoji, newColor)
    setNewName(''); setNewEmoji('📌'); setNewColor(TAG_COLORS[0])
    setAddingTag(false)
  }

  // ── collapsed pill ────────────────────────────────────────────
  if (collapsed) {
    return (
      <div style={s.pillWrap}>
        <button style={s.pill} onClick={() => setCollapsed(false)}>
          <span style={s.pillLabel}>OBSERVE</span>
          {active && <span style={s.pillCount}>{filteredCount}/{totalCount}</span>}
          <span style={s.pillArrow}>▸</span>
        </button>
        <button
          style={{ ...s.heatBtn, ...(heatmap ? s.heatBtnOn : {}) }}
          onClick={onHeatmapToggle}
          title={heatmap ? 'Switch to point view' : 'Switch to heat map'}
        >
          {heatmap ? '●' : '≋'}
        </button>
      </div>
    )
  }

  // ── expanded panel ────────────────────────────────────────────
  return (
    <div style={s.panel}>
      {/* Header */}
      <button style={s.header} onClick={() => setCollapsed(true)}>
        <span style={s.headerLeft}>
          <span style={s.title}>OBSERVE</span>
          <span style={s.countBadge}>
            {active ? `${filteredCount} / ${totalCount}` : `${totalCount}`}
          </span>
        </span>
        <span style={s.headerRight}>
          {active && (
            <span style={s.clearBtn} onClick={(e) => { e.stopPropagation(); clearAll() }}>
              Clear
            </span>
          )}
          <span
            style={{ ...s.heatBtn, ...(heatmap ? s.heatBtnOn : {}), flexShrink: 0 }}
            onClick={(e) => { e.stopPropagation(); onHeatmapToggle?.() }}
            title={heatmap ? 'Switch to point view' : 'Switch to heat map'}
          >
            {heatmap ? '●' : '≋'}
          </span>
          <span style={s.chevron}>◂</span>
        </span>
      </button>

      <div style={s.body}>

        {/* ── YEARS ── */}
        <div style={s.section}>
          <span style={s.sectionLabel}>YEARS</span>
          <div style={s.chipRow}>
            <Chip
              label="All"
              active={selectedYears.length === 0}
              color={T.brand}
              onClick={() => onChange({ ...filter, years: null })}
            />
            {availableYears.map((yr) => (
              <Chip
                key={yr}
                label={String(yr)}
                active={selectedYears.includes(yr)}
                color={T.brand}
                onClick={() => toggleYear(yr)}
              />
            ))}
          </div>
        </div>

        {/* ── MONTHS ── */}
        <div style={s.section}>
          <div style={s.sectionRow}>
            <span style={s.sectionLabel}>MONTHS</span>
            <div style={s.seasonRow}>
              {SEASONS.map((season) => {
                const allOn = season.months.every((m) => selectedMonths.includes(m))
                return (
                  <button
                    key={season.label}
                    style={{ ...s.seasonBtn, ...(allOn ? { color: season.color, borderColor: season.color, background: season.color + '14' } : {}) }}
                    onClick={() => toggleSeason(season.months)}
                  >
                    {season.label}
                  </button>
                )
              })}
            </div>
          </div>
          <div style={s.monthGrid}>
            {MONTH_ABBR.map((lbl, i) => {
              const m = i + 1
              return (
                <Chip
                  key={m}
                  label={lbl}
                  active={selectedMonths.includes(m)}
                  color={C.dustyBlue}
                  onClick={() => toggleMonth(m)}
                />
              )
            })}
          </div>
        </div>

        {/* ── TAGS ── */}
        <div style={{ ...s.section, borderBottom: 'none', paddingBottom: 10 }}>
          <div style={s.sectionRow}>
            <span style={s.sectionLabel}>TAGS</span>
            {selectedTags.length > 0 && (
              <button
                style={s.modeToggle}
                onClick={() => onChange({ ...filter, tagMode: filter.tagMode === 'any' ? 'all' : 'any' })}
                title="Toggle between matching ANY or ALL selected tags"
              >
                {filter.tagMode === 'any' ? 'Match ANY' : 'Match ALL'}
              </button>
            )}
          </div>
          <div style={s.chipRow}>
            {tagTypes.map((tt) => (
              <Chip
                key={tt.id}
                label={`${tt.emoji} ${tt.name}`}
                active={selectedTags.includes(tt.id)}
                color={tt.color}
                onClick={() => toggleTag(tt.id)}
              />
            ))}
          </div>

          {/* Add new tag type */}
          {!addingTag ? (
            <button style={s.addTagBtn} onClick={() => setAddingTag(true)}>
              + Add tag type
            </button>
          ) : (
            <div style={s.addTagForm}>
              <div style={s.emojiRow}>
                {TAG_EMOJIS.map((e) => (
                  <button
                    key={e}
                    style={{ ...s.emojiBtn, background: newEmoji === e ? T.surfaceBorder : 'transparent' }}
                    onClick={() => setNewEmoji(e)}
                  >
                    {e}
                  </button>
                ))}
              </div>
              <input
                style={s.tagInput}
                placeholder="Tag name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveNewTag()}
                autoFocus
              />
              <div style={s.colorRow}>
                {TAG_COLORS.map((c) => (
                  <button
                    key={c}
                    style={{ ...s.colorBtn, background: c, outline: newColor === c ? `2px solid ${T.text}` : '2px solid transparent' }}
                    onClick={() => setNewColor(c)}
                  />
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <button style={s.saveTagBtn} onClick={saveNewTag}>Save</button>
                <button style={s.cancelTagBtn} onClick={() => setAddingTag(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

/* ── Chip ──────────────────────────────────────────────────────── */
function Chip({ label, active, color, onClick }) {
  return (
    <button
      style={{
        ...chip.base,
        ...(active ? { background: color + '1a', borderColor: color, color, fontWeight: 700 } : {}),
      }}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

const chip = {
  base: {
    display: 'inline-flex', alignItems: 'center',
    padding: '3px 8px', borderRadius: 20,
    borderWidth: 1, borderStyle: 'solid', borderColor: T.surfaceBorder,
    background: 'transparent',
    color: T.textMuted, fontSize: 11, fontWeight: 500,
    cursor: 'pointer', transition: 'all 0.12s', whiteSpace: 'nowrap',
    fontFamily: 'inherit',
  },
}

/* ── Styles ──────────────────────────────────────────────────────── */
const s = {
  pillWrap: {
    position: 'absolute', bottom: 32, right: 16, zIndex: 10,
    display: 'flex', alignItems: 'center', gap: 6,
  },
  pill: {
    display: 'flex', alignItems: 'center', gap: 6,
    background: T.surface, backdropFilter: 'blur(10px)',
    border: `1px solid ${T.surfaceBorder}`, borderRadius: 8,
    padding: '7px 12px', boxShadow: T.surfaceShadow, cursor: 'pointer',
  },
  heatBtn: {
    width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: T.surface, border: `1px solid ${T.surfaceBorder}`,
    borderRadius: 6, boxShadow: T.surfaceShadow, cursor: 'pointer',
    fontSize: 13, color: T.textMuted, fontFamily: 'inherit', padding: 0,
    transition: 'all 0.15s',
  },
  heatBtnOn: {
    background: C.burntOrange + '18',
    borderColor: C.burntOrange + '55',
    color: C.burntOrange,
  },
  pillLabel: {
    color: T.textFaint, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
  },
  pillCount: {
    background: C.burntOrange, color: T.surface,
    fontSize: 10, fontWeight: 700, borderRadius: 10,
    padding: '1px 6px',
  },
  pillArrow: { color: T.textFaint, fontSize: 11 },

  panel: {
    position: 'absolute', bottom: 32, right: 16, zIndex: 10,
    background: T.surface, backdropFilter: 'blur(10px)',
    border: `1px solid ${T.surfaceBorder}`, borderRadius: 10,
    boxShadow: T.surfaceShadow,
    width: 290, maxHeight: 'calc(100vh - 80px)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    width: '100%', background: 'transparent', border: 'none',
    borderBottom: `1px solid ${T.surfaceBorder}`, padding: '9px 14px', cursor: 'pointer',
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 8 },
  title: { color: T.textFaint, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em' },
  countBadge: {
    color: T.textMuted, fontSize: 11,
  },
  headerRight: { display: 'flex', alignItems: 'center', gap: 8 },
  clearBtn: {
    color: T.danger, fontSize: 10, fontWeight: 600, letterSpacing: '0.05em',
    cursor: 'pointer', padding: '2px 6px', borderRadius: 4,
    border: `1px solid ${T.dangerBorder}`, background: T.dangerBg,
  },
  chevron: { color: T.textFaint, fontSize: 11 },

  body: { overflowY: 'auto', flex: 1 },

  section: {
    padding: '10px 14px 8px',
    borderBottom: `1px solid ${T.surfaceBorder}`,
  },
  sectionRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6,
  },
  sectionLabel: {
    display: 'block', marginBottom: 6,
    color: T.textFaint, fontSize: 9, fontWeight: 700,
    letterSpacing: '0.12em', textTransform: 'uppercase',
  },
  chipRow: {
    display: 'flex', flexWrap: 'wrap', gap: 4,
  },

  seasonRow: { display: 'flex', gap: 3 },
  seasonBtn: {
    fontSize: 10, fontWeight: 600,
    padding: '2px 7px', borderRadius: 4,
    border: `1px solid ${T.surfaceBorder}`,
    background: 'transparent', color: T.textMuted,
    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s',
  },
  monthGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 3,
  },

  modeToggle: {
    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
    border: `1px solid ${T.surfaceBorder}`, background: T.surfaceBorder,
    color: T.textMuted, cursor: 'pointer', fontFamily: 'inherit',
  },

  addTagBtn: {
    marginTop: 8, fontSize: 11, color: T.brand, background: 'transparent',
    border: `1px dashed ${T.brandBorder}`, borderRadius: 6,
    padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit',
  },
  addTagForm: {
    marginTop: 8, padding: 8,
    background: T.surfaceBorder,
    borderRadius: 8,
    border: `1px solid ${T.surfaceBorder}`,
    display: 'flex', flexDirection: 'column', gap: 6,
  },
  emojiRow: { display: 'flex', flexWrap: 'wrap', gap: 2 },
  emojiBtn: {
    width: 26, height: 26, fontSize: 14, border: '1px solid transparent',
    borderRadius: 4, cursor: 'pointer', padding: 0,
  },
  tagInput: {
    width: '100%', boxSizing: 'border-box',
    background: T.surface, border: `1px solid ${T.surfaceBorder}`,
    borderRadius: 5, padding: '5px 8px',
    fontSize: 12, color: T.text, fontFamily: 'inherit', outline: 'none',
  },
  colorRow: { display: 'flex', gap: 4, flexWrap: 'wrap' },
  colorBtn: {
    width: 18, height: 18, borderRadius: '50%', border: 'none', cursor: 'pointer',
    outlineOffset: 2,
  },
  saveTagBtn: {
    flex: 1, background: T.brand, border: 'none', borderRadius: 5,
    color: T.textOnDark, fontSize: 11, fontWeight: 700, padding: '5px 0',
    cursor: 'pointer', fontFamily: 'inherit',
  },
  cancelTagBtn: {
    flex: 1, background: 'transparent', border: `1px solid ${T.surfaceBorder}`,
    borderRadius: 5, color: T.textMuted, fontSize: 11,
    padding: '5px 0', cursor: 'pointer', fontFamily: 'inherit',
  },
}
