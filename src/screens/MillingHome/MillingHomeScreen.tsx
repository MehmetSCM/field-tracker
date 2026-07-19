import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { formatDayLabel, todayLocalDateString } from '../../lib/dateFormat'
import type { EntryResumePayload } from '../../lib/entrySession'
import { useCurrentProject } from '../../lib/useCurrentProject'
import { fetchPastSessionGroups, type PastSessionGroup } from '../../lib/supabase/milling'
import './MillingHomeScreen.css'

function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && err !== null && 'message' in err && typeof err.message === 'string') {
    return err.message
  }
  return fallback
}

interface DayGroup {
  date: string
  totalArea: number
  sessions: PastSessionGroup[]
}

function groupByDay(sessions: PastSessionGroup[]): DayGroup[] {
  const byDate = new Map<string, PastSessionGroup[]>()
  for (const session of sessions) {
    const existing = byDate.get(session.date)
    if (existing) existing.push(session)
    else byDate.set(session.date, [session])
  }
  return [...byDate.entries()]
    .map(([date, dateSessions]) => ({
      date,
      totalArea: dateSessions.reduce((sum, s) => sum + s.area, 0),
      sessions: dateSessions,
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
}

/**
 * Landing screen for an activity (Milling or Paving — see the `activity`
 * prop), reached from Home — separate from the actual entry flow
 * (MillingEntryScreen/PavingEntryScreen, at /:activity/new) so starting a
 * new entry is one deliberate tap, not something that happens just by
 * navigating here. Below the start card: every previous day with entries
 * FOR THE CURRENT PROJECT (see currentProject.ts) — never mixed across
 * projects — broken out by individual session (not just by day — a day can
 * hold several disjoint direction/thread sessions within that one project,
 * each independently resumable). Every session gets a "Continue from here"
 * resume icon except ones whose segment+direction is already fully covered
 * by confirmed readings, since there'd be nothing left to add.
 *
 * Shared by both activities rather than duplicated — only fetchPastSessionGroups'
 * activity argument and the two hardcoded /milling/... routes below differ
 * per activity, everything else (markup, CSS, grouping/resume logic) is
 * identical. Still named "Milling*" for historical reasons (this predates
 * Paving reusing it) — a purely cosmetic mismatch, not a functional one.
 */
export function MillingHomeScreen({ activity }: { activity: 'milling' | 'paving' }) {
  const navigate = useNavigate()
  const currentProject = useCurrentProject()
  const [days, setDays] = useState<DayGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!currentProject) {
      setDays([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    fetchPastSessionGroups(activity, todayLocalDateString(), currentProject.id)
      .then((sessions) => setDays(groupByDay(sessions)))
      .catch((err: unknown) => setError(extractErrorMessage(err, 'Failed to load previous days.')))
      .finally(() => setLoading(false))
  }, [activity, currentProject])

  function handleResume(session: PastSessionGroup) {
    const resume: EntryResumePayload = {
      projectId: session.projectId,
      direction: session.direction,
      ascendingDescending: session.ascendingDescending,
      startingStation: session.startingStation,
    }
    navigate(`/${activity}/new`, { state: { resume } })
  }

  return (
    <div className="milling-home-screen">
      <Link to={`/${activity}/new`} className="milling-home-start">
        Start New Entry
      </Link>

      <section className="milling-home-history">
        <h2>Previous Days</h2>

        {!currentProject && (
          <p className="milling-home-empty">No project selected — choose one from the header to see previous sessions.</p>
        )}
        {currentProject && loading && <p>Loading…</p>}
        {currentProject && error && <p className="milling-home-error">{error}</p>}
        {currentProject && !loading && !error && days.length === 0 && (
          <p className="milling-home-empty">No previous entries yet.</p>
        )}

        <ul className="milling-home-day-list">
          {days.map((day) => (
            <li key={day.date} className="milling-home-day-group">
              <div className="milling-home-day-heading">
                <span className="milling-home-day-date">{formatDayLabel(day.date)}</span>
                <strong className="milling-home-day-area">{day.totalArea.toFixed(2)} m²</strong>
              </div>

              <ul className="milling-home-session-list">
                {day.sessions.map((session) => (
                  <li key={session.key} className="milling-home-session-row">
                    <Link
                      to={`/${activity}/day/${day.date}/segment/${session.roadSegmentId}`}
                      className="milling-home-session-link"
                    >
                      <span className="milling-home-session-meta">
                        {session.projectContractNumber} · {session.direction}
                        {session.ascendingDescending && (
                          <>
                            {' · '}
                            {/* Icon, not the word — "ascending"/"descending" was
                                truncating to "ascen…"/"descen…" on narrow cards,
                                real information loss rather than just tight
                                spacing. Same ↑/↓ already used on the entry
                                setup screen's Ascending/Descending buttons.
                                aria-label keeps it non-ambiguous for screen
                                readers too, not just sighted users. */}
                            <span aria-label={session.ascendingDescending}>
                              {session.ascendingDescending === 'ascending' ? '↑' : '↓'}
                            </span>
                          </>
                        )}
                      </span>
                      <span className="milling-home-session-area">{session.area.toFixed(2)} m²</span>
                    </Link>
                    {!session.fullyCovered && (
                      <button
                        type="button"
                        className="milling-home-resume-button"
                        aria-label="Continue from here"
                        onClick={() => handleResume(session)}
                      >
                        ▶
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
