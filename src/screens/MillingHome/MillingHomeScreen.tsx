import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDayLabel, todayLocalDateString } from '../../lib/dateFormat'
import { fetchPastDaySummaries, type DaySummary } from '../../lib/supabase/milling'
import './MillingHomeScreen.css'

function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && err !== null && 'message' in err && typeof err.message === 'string') {
    return err.message
  }
  return fallback
}

/**
 * Landing screen for Milling, reached from Home — separate from the actual
 * entry flow (MillingEntryScreen, at /milling/new) so starting a new entry
 * is one deliberate tap, not something that happens just by navigating
 * here. Below the start card: every previous day with entries, across all
 * projects (there's no crew-to-project scoping anywhere yet), grouped by
 * date and read-only until tapped into.
 */
export function MillingHomeScreen() {
  const [summaries, setSummaries] = useState<DaySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchPastDaySummaries(todayLocalDateString())
      .then(setSummaries)
      .catch((err) => setError(extractErrorMessage(err, 'Failed to load previous days.')))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="milling-home-screen">
      <Link to="/milling/new" className="milling-home-start">
        Start New Entry
      </Link>

      <section className="milling-home-history">
        <h2>Previous Days</h2>

        {loading && <p>Loading…</p>}
        {error && <p className="milling-home-error">{error}</p>}
        {!loading && !error && summaries.length === 0 && (
          <p className="milling-home-empty">No previous entries yet.</p>
        )}

        <ul>
          {summaries.map((day) => (
            <li key={day.date}>
              <Link to={`/milling/day/${day.date}`} className="milling-home-day-row">
                <div className="milling-home-day-main">
                  <span className="milling-home-day-date">{formatDayLabel(day.date)}</span>
                  <span className="milling-home-day-meta">
                    {day.projectContractNumbers.join(', ')} · {day.directions.join(', ')}
                  </span>
                </div>
                <strong className="milling-home-day-area">{day.totalArea.toFixed(2)} m²</strong>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
