import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { formatDayLabel } from '../../lib/dateFormat'
import { fetchDayReadingGroups, type DaySegmentGroup } from '../../lib/supabase/milling'
// Reuses .milling-summary/.milling-list/.milling-entry*/.milling-badge* from
// the entry screen rather than duplicating them — this view intentionally
// looks like a read-only version of the same list.
import '../MillingEntry/MillingEntryScreen.css'
import './MillingHomeScreen.css'

function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && err !== null && 'message' in err && typeof err.message === 'string') {
    return err.message
  }
  return fallback
}

/**
 * Read-only view of everything entered on one past date, across every
 * segment touched that day. Correction (with the past-day warning) is
 * wired in separately — this screen just displays.
 */
export function MillingDayDetailScreen() {
  const { date } = useParams<{ date: string }>()
  const [groups, setGroups] = useState<DaySegmentGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!date) return
    fetchDayReadingGroups(date)
      .then(setGroups)
      .catch((err) => setError(extractErrorMessage(err, 'Failed to load this day.')))
      .finally(() => setLoading(false))
  }, [date])

  const totalArea = groups.reduce((sum, g) => sum + g.area, 0)

  return (
    <div className="milling-home-screen">
      <Link to="/milling" className="milling-home-start-link-back">
        ← Previous Days
      </Link>

      <h1 className="milling-home-day-title">{date ? formatDayLabel(date) : ''}</h1>

      {loading && <p>Loading…</p>}
      {error && <p className="milling-home-error">{error}</p>}

      {!loading && !error && (
        <>
          <section className="milling-summary">
            <span>Total area</span>
            <strong>{totalArea.toFixed(2)} m²</strong>
          </section>

          {groups.length === 0 && <p className="milling-home-empty">No entries found for this day.</p>}

          {groups.map((group) => (
            <section key={group.roadSegmentId} className="milling-list milling-day-segment-group">
              <h2 className="milling-day-segment-heading">
                {group.projectContractNumber} — {group.highway} {group.direction}
              </h2>
              <ul>
                {group.readings.map((r) => {
                  const isSuperseded = r.supersededBy !== null
                  return (
                    <li key={r.id} className={isSuperseded ? 'milling-entry-superseded' : 'milling-entry'}>
                      <span className="milling-entry-station">{r.station} m</span>
                      <span className="milling-entry-width">{r.width} m wide</span>
                      {r.isCorrection && <span className="milling-badge milling-badge-correction">corrected</span>}
                      {isSuperseded && <span className="milling-badge milling-badge-superseded">superseded</span>}
                      {!isSuperseded && <span className="milling-badge milling-badge-synced">synced</span>}
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  )
}
