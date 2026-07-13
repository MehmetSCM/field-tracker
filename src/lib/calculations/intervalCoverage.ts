export interface Interval {
  lo: number
  hi: number
}

/**
 * Classic sweep-line interval merge — sorts by lo (then hi), and starts a
 * new merge group whenever the current interval's lo falls strictly past
 * the running max hi of everything merged so far (a real gap). Touching
 * intervals (lo === running max hi) merge. Same rule as
 * segment_group_completion_status's SQL merge in
 * supabase/migrations/20260705110000_lifecycle_event_station_coverage.sql
 * ("Touching intervals (lo == running_max) merge, matching
 * next.from_station <= running_max_to_station"), reimplemented here as a
 * plain, testable function instead of a raw SQL window-function query —
 * that view is specific to surface_lifecycle_events coverage types and
 * isn't callable generically, so this is the reusable form of the same
 * algorithm.
 */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return []
  const sorted = [...intervals].sort((a, b) => (a.lo !== b.lo ? a.lo - b.lo : a.hi - b.hi))

  const merged: Interval[] = []
  let currentLo = sorted[0].lo
  let currentHi = sorted[0].hi

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i]
    if (next.lo > currentHi) {
      merged.push({ lo: currentLo, hi: currentHi })
      currentLo = next.lo
      currentHi = next.hi
    } else {
      currentHi = Math.max(currentHi, next.hi)
    }
  }
  merged.push({ lo: currentLo, hi: currentHi })

  return merged
}

/**
 * Returns the covered interval a station falls strictly inside, or null if
 * it doesn't — landing exactly on a boundary (continuing from where
 * coverage currently ends, or backing onto where it currently starts) is
 * valid and expected, not a violation.
 */
export function findStrictlyInsideCoverage(station: number, merged: Interval[]): Interval | null {
  for (const interval of merged) {
    if (station > interval.lo && station < interval.hi) return interval
  }
  return null
}
