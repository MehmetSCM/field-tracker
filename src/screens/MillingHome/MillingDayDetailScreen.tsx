import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CorrectionForm } from '../MillingEntry/CorrectionForm'
import { todayLocalDateString, formatDayLabel } from '../../lib/dateFormat'
import { db, type QueuedWidthReading } from '../../lib/db'
import { fetchDayReadingGroups, type DaySegmentGroup } from '../../lib/supabase/milling'
import { importServerReadings } from '../../lib/sync/widthReadingsSync'
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
 * segment touched that day — with an edit path into the same correction
 * flow the live entry screen uses (same supersede mechanism, same
 * CorrectionForm), flagged with the "may affect previously calculated
 * totals" warning the live same-day flow doesn't need.
 */
export function MillingDayDetailScreen() {
  const { date } = useParams<{ date: string }>()
  const [groups, setGroups] = useState<DaySegmentGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [preparingEntryId, setPreparingEntryId] = useState<string | null>(null)
  const [correctingEntry, setCorrectingEntry] = useState<QueuedWidthReading | null>(null)

  function loadGroups() {
    if (!date) return
    setLoading(true)
    setError(null)
    fetchDayReadingGroups(date)
      .then(setGroups)
      .catch((err) => setError(extractErrorMessage(err, 'Failed to load this day.')))
      .finally(() => setLoading(false))
  }

  useEffect(loadGroups, [date])

  const totalArea = groups.reduce((sum, g) => sum + g.area, 0)

  // The local offline queue only ever mirrors TODAY's active segment (see
  // MillingEntryScreen) — a past day's readings usually aren't in it yet.
  // applyCorrection needs a real QueuedWidthReading (with a Dexie localId)
  // to update, so this imports that one segment/date first (idempotent —
  // matches existing rows by serverId) and then reads back the row Dexie
  // now has for it.
  async function startCorrection(roadSegmentId: string, readingId: string) {
    if (!date) return
    setPreparingEntryId(readingId)
    setError(null)
    try {
      await importServerReadings(roadSegmentId, date)
      const queued = await db.widthReadingsQueue.where('serverId').equals(readingId).first()
      if (!queued) throw new Error('Could not find this reading to correct.')
      setCorrectingEntry(queued)
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to open this entry for correction.'))
    } finally {
      setPreparingEntryId(null)
    }
  }

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
                  const canEdit = !isSuperseded
                  return (
                    <li key={r.id} className={isSuperseded ? 'milling-entry-superseded' : 'milling-entry'}>
                      <span className="milling-entry-station">{r.station} m</span>
                      <span className="milling-entry-width">{r.width} m wide</span>
                      {r.isCorrection && <span className="milling-badge milling-badge-correction">corrected</span>}
                      {isSuperseded && <span className="milling-badge milling-badge-superseded">superseded</span>}
                      {!isSuperseded && <span className="milling-badge milling-badge-synced">synced</span>}
                      {canEdit && (
                        <button
                          type="button"
                          className="milling-edit-button"
                          aria-label="Edit entry"
                          disabled={preparingEntryId === r.id}
                          onClick={() => startCorrection(group.roadSegmentId, r.id)}
                        >
                          {preparingEntryId === r.id ? '…' : '✏️'}
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </>
      )}

      {correctingEntry && (
        <CorrectionForm
          entry={correctingEntry}
          isPastDayCorrection={date !== todayLocalDateString()}
          onClose={() => setCorrectingEntry(null)}
          onSaved={loadGroups}
        />
      )}
    </div>
  )
}
