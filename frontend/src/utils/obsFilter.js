// Pure client-side observation filter — no DB calls
// filter: { years: number[]|null, months: number[]|null, tagIds: string[], tagMode: 'any'|'all' }

export const DEFAULT_OBS_FILTER = {
  years:   null,   // null = all years
  months:  null,   // null = all months
  tagIds:  [],     // empty = no tag filter
  tagMode: 'any',  // 'any' show obs matching ANY selected tag, 'all' requires ALL
}

function parseObservedDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function isFilterActive(filter) {
  if (!filter) return false
  return (
    (filter.years  && filter.years.length  > 0) ||
    (filter.months && filter.months.length > 0) ||
    (filter.tagIds && filter.tagIds.length > 0)
  )
}

export function filterObservations(observations, filter) {
  if (!filter || !isFilterActive(filter)) return observations
  const { years, months, tagIds, tagMode } = filter

  return observations.filter((obs) => {
    const date = parseObservedDate(obs.observed_at)

    if (years && years.length > 0) {
      if (!date || !years.includes(date.getFullYear())) return false
    }

    if (months && months.length > 0) {
      if (!date || !months.includes(date.getMonth() + 1)) return false
    }

    if (tagIds && tagIds.length > 0) {
      const obsTagIds = obs.tag_ids || []
      if (tagMode === 'all') {
        if (!tagIds.every((id) => obsTagIds.includes(id))) return false
      } else {
        if (!tagIds.some((id) => obsTagIds.includes(id))) return false
      }
    }

    return true
  })
}

// Derive sorted unique years from observations array
export function getObservationYears(observations) {
  const years = new Set()
  observations.forEach((o) => {
    const date = parseObservedDate(o.observed_at)
    if (date) years.add(date.getFullYear())
  })
  return [...years].sort((a, b) => b - a) // newest first
}
