import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CorrectionForm } from '../MillingEntry/CorrectionForm'
import { formatDayLabel } from '../../lib/dateFormat'
import { db, type QueuedWidthReading } from '../../lib/db'
import { fetchSessionReadings, type DaySegmentGroup, type PastReadingRow } from '../../lib/supabase/milling'
import { importServerReadings } from '../../lib/sync/widthReadingsSync'
import { InsertReadingAfterForm } from './InsertReadingAfterForm'
import { InsertReadingBeforeForm } from './InsertReadingBeforeForm'
import { VoidReadingForm } from './VoidReadingForm'
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
 * One session's full reading history — reached from a session row's resume
 * icon area on MillingHomeScreen (previous-days list), scoped to exactly
 * one (date, roadSegmentId) rather than the whole calendar day the way
 * MillingDayDetailScreen is. Every reading shows here, including superseded
 * and voided ones (struck through, never hidden — this table has no delete
 * path at all), with a per-row "⋮" menu for Edit / Void / Insert reading
 * after / Insert reading before. Edit reuses the existing correction flow
 * as-is. Void and both Inserts go through voidWidthReading/
 * insertWidthReadingBetween/insertWidthReadingBefore directly — all
 * one-shot server mutations keyed by the reading's real id, so unlike Edit
 * none of them need the local-Dexie-import detour (that's specifically there so
 * applyCorrection can hand supersedeWidthReading a QueuedWidthReading with
 * a localId; Void and Insert never touch the local queue at all). Always
 * reached from a past day (this screen only exists off the previous-days
 * list, never today's live session), so the "may affect previously
 * calculated totals" warning is unconditional here, same as Edit's.
 *
 * Shared by both activities via the `activity` prop — see MillingHomeScreen's
 * own comment for why this stays "Milling*"-named despite serving Paving too.
 */
export function ReviewReadingsScreen({ activity }: { activity: 'milling' | 'paving' }) {
  const { date, roadSegmentId } = useParams<{ date: string; roadSegmentId: string }>()
  const [group, setGroup] = useState<DaySegmentGroup | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [preparingEntryId, setPreparingEntryId] = useState<string | null>(null)
  const [correctingEntry, setCorrectingEntry] = useState<QueuedWidthReading | null>(null)
  const [voidingReading, setVoidingReading] = useState<PastReadingRow | null>(null)
  const [insertingAfterReading, setInsertingAfterReading] = useState<PastReadingRow | null>(null)
  const [insertingBeforeReading, setInsertingBeforeReading] = useState<PastReadingRow | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  function load() {
    if (!date || !roadSegmentId) return
    setLoading(true)
    setError(null)
    fetchSessionReadings(activity, date, roadSegmentId)
      .then(setGroup)
      .catch((err) => setError(extractErrorMessage(err, 'Failed to load this session.')))
      .finally(() => setLoading(false))
  }

  useEffect(load, [activity, date, roadSegmentId])

  async function startCorrection(readingId: string) {
    if (!date || !roadSegmentId) return
    setOpenMenuId(null)
    setPreparingEntryId(readingId)
    setError(null)
    try {
      await importServerReadings(activity, roadSegmentId, date)
      const queued = await db.widthReadingsQueue.where('serverId').equals(readingId).first()
      if (!queued) throw new Error('Could not find this reading to correct.')
      setCorrectingEntry(queued)
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to open this entry for correction.'))
    } finally {
      setPreparingEntryId(null)
    }
  }

  function renderRow(r: PastReadingRow) {
    const isSuperseded = r.supersededBy !== null
    const struckThrough = isSuperseded || r.isVoided
    const canEdit = !isSuperseded

    return (
      <li key={r.id} className={struckThrough ? 'milling-entry-superseded' : 'milling-entry'}>
        <span className="milling-entry-station">{r.station} m</span>
        <span className="milling-entry-width">{r.width} m wide</span>
        <span className="milling-entry-status">
          {r.isCorrection && <span className="milling-badge milling-badge-correction">corrected</span>}
          {isSuperseded && <span className="milling-badge milling-badge-superseded">superseded</span>}
          {r.isVoided && <span className="milling-badge milling-badge-voided">voided</span>}
          {!isSuperseded && !r.isVoided && (
            <span className="milling-sync-dot milling-sync-dot-synced" role="status" aria-label="Synced" title="Synced" />
          )}

          <div className="milling-row-menu-wrap">
            <button
              type="button"
              className="milling-row-menu-button"
              aria-label="Reading actions"
              disabled={preparingEntryId === r.id}
              onClick={(e) => {
                e.stopPropagation()
                setOpenMenuId(openMenuId === r.id ? null : r.id)
              }}
            >
              {preparingEntryId === r.id ? '…' : '⋮'}
            </button>

            {openMenuId === r.id && (
              <div className="milling-row-menu" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="milling-row-menu-item" disabled={!canEdit} onClick={() => startCorrection(r.id)}>
                  Edit
                </button>
                <button
                  type="button"
                  className="milling-row-menu-item"
                  disabled={isSuperseded || r.isVoided}
                  onClick={() => {
                    setOpenMenuId(null)
                    setVoidingReading(r)
                  }}
                >
                  Void
                </button>
                <button
                  type="button"
                  className="milling-row-menu-item"
                  onClick={() => {
                    setOpenMenuId(null)
                    setInsertingAfterReading(r)
                  }}
                >
                  Insert reading after
                </button>
                <button
                  type="button"
                  className="milling-row-menu-item"
                  onClick={() => {
                    setOpenMenuId(null)
                    setInsertingBeforeReading(r)
                  }}
                >
                  Insert reading before
                </button>
              </div>
            )}
          </div>
        </span>
      </li>
    )
  }

  return (
    <div className="milling-home-screen" onClick={() => setOpenMenuId(null)}>
      <Link to={`/${activity}`} className="milling-home-start-link-back">
        ← Previous Days
      </Link>

      {loading && <p>Loading…</p>}
      {error && <p className="milling-home-error">{error}</p>}

      {!loading && !error && !group && <p className="milling-home-empty">No readings found for this session.</p>}

      {!loading && !error && group && (
        <>
          <h1 className="milling-home-day-title">{date ? formatDayLabel(date) : ''}</h1>
          <p className="milling-day-segment-heading">
            {group.projectContractNumber} — {group.highway} {group.direction}
          </p>

          <section className="milling-summary">
            <span>Total area</span>
            <strong>{group.area.toFixed(2)} m²</strong>
          </section>

          <ul className="milling-list">{group.readings.map(renderRow)}</ul>
        </>
      )}

      {correctingEntry && (
        <CorrectionForm entry={correctingEntry} isPastDayCorrection onClose={() => setCorrectingEntry(null)} onSaved={load} />
      )}

      {voidingReading && (
        <VoidReadingForm
          readingId={voidingReading.id}
          station={voidingReading.station}
          width={voidingReading.width}
          isPastDayVoid
          onClose={() => setVoidingReading(null)}
          onSaved={load}
        />
      )}

      {insertingAfterReading && (
        <InsertReadingAfterForm
          afterReadingId={insertingAfterReading.id}
          afterStation={insertingAfterReading.station}
          isPastDayInsert
          onClose={() => setInsertingAfterReading(null)}
          onSaved={load}
        />
      )}

      {insertingBeforeReading && (
        <InsertReadingBeforeForm
          beforeReadingId={insertingBeforeReading.id}
          beforeStation={insertingBeforeReading.station}
          isPastDayInsert
          onClose={() => setInsertingBeforeReading(null)}
          onSaved={load}
        />
      )}
    </div>
  )
}
