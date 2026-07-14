import { useEffect, useMemo, useState } from 'react'
import { ExtraAreaForm } from '../../components/ExtraAreaForm'
import { findStrictlyInsideCoverage, mergeIntervals, type Interval } from '../../lib/calculations/intervalCoverage'
import { calculateSegments, cumulativeArea } from '../../lib/calculations/segmentArea'
import { resolveSegmentForStation } from '../../lib/calculations/segmentResolution'
import { todayLocalDateString } from '../../lib/dateFormat'
import { db, type QueuedWidthReading } from '../../lib/db'
import { getEntrySession, type EntrySessionDirection } from '../../lib/entrySession'
import {
  fetchCurrentCrewMember,
  fetchProjects,
  fetchProjectSegmentCandidates,
  fetchStationCoverageIntervals,
  type CurrentCrewMember,
  type ProjectOption,
  type SegmentCandidate,
} from '../../lib/supabase/milling'
import {
  enqueueWidthReading,
  importServerReadings,
  registerSyncListeners,
} from '../../lib/sync/widthReadingsSync'
import { useLiveQuery } from '../../lib/sync/useLiveQuery'
import { useCurrentProfile } from '../../lib/useCurrentProfile'
import { useEntrySession } from '../../lib/useEntrySession'
import { CorrectionForm } from './CorrectionForm'
import './MillingEntryScreen.css'

const ACTIVITY = 'milling'

// Supabase/PostgREST errors are plain objects with a `message` property, not
// actual Error instances — `instanceof Error` misses them and would hide the
// real reason behind a generic fallback string.
function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && err !== null && 'message' in err && typeof err.message === 'string') {
    return err.message
  }
  return fallback
}

/**
 * Uniform for both a clean multiple-of-50 last station and an irregular
 * one — floor/ceil to the next full 50 in the declared direction, not a
 * simple +/-50, so an irregular reading (e.g. 28,537) still proposes a
 * clean round number (28,550) rather than another irregular one.
 */
function computeNextStation(lastStation: number, direction: EntrySessionDirection): number {
  return direction === 'ascending'
    ? (Math.floor(lastStation / 50) + 1) * 50
    : (Math.ceil(lastStation / 50) - 1) * 50
}

const today = todayLocalDateString()

export function MillingEntryScreen() {
  // crewMember comes from a REAL Supabase Auth session, if one exists (it
  // won't, until Google OAuth ships — this stays here so the header
  // automatically starts showing the verified identity the moment a real
  // session does exist, with no UI change needed). profile is the
  // claimed/unverified fallback. Real auth wins whenever both are present,
  // mirroring the server's effective_crew_member_id() priority exactly.
  const [crewMember, setCrewMember] = useState<CurrentCrewMember | null>(null)
  const [crewMemberError, setCrewMemberError] = useState<string | null>(null)
  const profile = useCurrentProfile()

  const displayName = crewMember?.name ?? profile?.name ?? null
  const hasIdentity = crewMember !== null || profile !== null

  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState('')

  // Segment is no longer manually picked — every road_segment for the
  // project is fetched once, and segmentResolution.ts resolves which one a
  // typed station belongs to. Direction (NB/SB/etc) is still explicit: it's
  // a real physical-road distinction, not something a station number alone
  // can imply, and multiple segment groups can share a direction.
  const [segmentCandidates, setSegmentCandidates] = useState<SegmentCandidate[]>([])
  const [selectedDirection, setSelectedDirection] = useState('')

  const availableDirections = useMemo(
    () => [...new Set(segmentCandidates.map((c) => c.direction))],
    [segmentCandidates],
  )

  const ready = selectedProjectId !== '' && selectedDirection !== ''

  const [loadingReadings, setLoadingReadings] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [stationInput, setStationInput] = useState('')
  const [widthInput, setWidthInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Persisted to localStorage (see entrySession.ts) keyed by activity +
  // project + direction — survives navigating away and back, closing and
  // reopening the tab, and going offline/online. Only cleared by the
  // explicit "End session" action (handleEndSession/clearSession below),
  // never by navigation, app restart, or a connectivity change. The active
  // segment (auto-resolved from the station) lives inside this session
  // state too, since it can change mid-session as the walk crosses a
  // segment boundary.
  const { session, update: updateSession, clear: clearSession } = useEntrySession(
    ACTIVITY,
    selectedProjectId || null,
    selectedDirection || null,
  )

  const activeSegment = segmentCandidates.find((c) => c.id === session.activeSegmentId) ?? null

  // [lo, hi] per prior day with active readings on the active segment —
  // merged with today's live interval (from activeEntries, below) to check
  // new stations against. Excludes today's own date since that comes from
  // the live local queue instead, which reflects not-yet-synced entries
  // this server fetch wouldn't have yet.
  const [historicalIntervals, setHistoricalIntervals] = useState<Interval[]>([])
  const [coverageError, setCoverageError] = useState<string | null>(null)

  const [correctingEntry, setCorrectingEntry] = useState<QueuedWidthReading | null>(null)

  useEffect(() => {
    registerSyncListeners()
  }, [])

  useEffect(() => {
    fetchCurrentCrewMember()
      .then(setCrewMember)
      .catch((err) => setCrewMemberError(extractErrorMessage(err, 'Failed to load crew member.')))
  }, [])

  useEffect(() => {
    fetchProjects().then(setProjects)
  }, [])

  useEffect(() => {
    setSelectedDirection('')
    setSegmentCandidates([])
    if (!selectedProjectId) return
    fetchProjectSegmentCandidates(selectedProjectId).then(setSegmentCandidates)
  }, [selectedProjectId])

  // Every project/direction (re)selection resumes THAT combination's own
  // persisted session (useEntrySession's own effect handles loading
  // `session` itself) — this effect's job is just to pre-fill the station
  // proposal to match whatever's already stored. Reads storage directly via
  // getEntrySession rather than through `session` so it can't race the
  // hook's own change effect (both fire off this same selectedDirection
  // change).
  useEffect(() => {
    setFormError(null)
    setWidthInput('')

    if (!selectedProjectId || !selectedDirection) {
      setStationInput('')
      return
    }

    const persisted = getEntrySession(ACTIVITY, selectedProjectId, selectedDirection)
    setStationInput(
      persisted.direction && persisted.lastStation !== null
        ? String(computeNextStation(persisted.lastStation, persisted.direction))
        : '',
    )
  }, [selectedProjectId, selectedDirection])

  // Whenever the resolved active segment changes (including a mid-session
  // crossing into a different segment) — reload its historical coverage.
  useEffect(() => {
    setHistoricalIntervals([])
    setCoverageError(null)
    if (!session.activeSegmentId) return
    fetchStationCoverageIntervals(session.activeSegmentId, today)
      .then(setHistoricalIntervals)
      .catch((err) => setCoverageError(extractErrorMessage(err, 'Failed to load station coverage.')))
  }, [session.activeSegmentId])

  // Pull today's server-confirmed rows into the local queue table once per
  // active-segment change. After this, the running list reads entirely from
  // Dexie (via useLiveQuery below) — server rows and locally-queued rows
  // live in the same local table, so there's nothing to reconcile between
  // "the fetched list" and "the queue".
  useEffect(() => {
    if (!session.activeSegmentId) return
    setLoadingReadings(true)
    setLoadError(null)
    importServerReadings(session.activeSegmentId, today)
      .catch((err) => setLoadError(extractErrorMessage(err, 'Failed to load entries.')))
      .finally(() => setLoadingReadings(false))
  }, [session.activeSegmentId])

  const allEntries = useLiveQuery(
    () =>
      session.activeSegmentId
        ? db.widthReadingsQueue
            .where('roadSegmentId')
            .equals(session.activeSegmentId)
            .filter((r) => r.date === today)
            .toArray()
        : Promise.resolve([]),
    [session.activeSegmentId],
    [] as QueuedWidthReading[],
  )

  const sortedEntries = useMemo(
    () =>
      [...allEntries].sort((a, b) =>
        a.stationSequence !== b.stationSequence
          ? a.stationSequence - b.stationSequence
          : a.createdAt - b.createdAt,
      ),
    [allEntries],
  )

  // Superseded readings (their own superseded_by is set, pointing at the
  // correction that replaced them) are excluded from the live calculation —
  // the correction row itself is what's authoritative.
  const activeEntries = useMemo(() => sortedEntries.filter((r) => r.supersededBy === null), [sortedEntries])

  // Today's own coverage, computed live from the local queue rather than
  // fetched — always reflects not-yet-synced entries, unlike
  // historicalIntervals (a one-time server fetch per active-segment change).
  const todayCoverageInterval = useMemo<Interval | null>(() => {
    if (activeEntries.length === 0) return null
    const stations = activeEntries.map((r) => r.station)
    return { lo: Math.min(...stations), hi: Math.max(...stations) }
  }, [activeEntries])

  const mergedCoverage = useMemo(
    () => mergeIntervals(todayCoverageInterval ? [...historicalIntervals, todayCoverageInterval] : historicalIntervals),
    [historicalIntervals, todayCoverageInterval],
  )

  const liveSegments = useMemo(() => {
    if (activeEntries.length < 2) return []
    return calculateSegments(
      activeEntries.map((r) => ({
        stationSequence: r.stationSequence,
        station: r.station,
        width: r.width,
      })),
    )
  }, [activeEntries])

  const liveTotalArea = useMemo(() => cumulativeArea(liveSegments), [liveSegments])

  const queuedCount = useMemo(() => allEntries.filter((r) => r.status === 'queued').length, [allEntries])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedProjectId || !selectedDirection || !hasIdentity || !session.direction || session.blocked) return

    const stationValue = Number(stationInput)
    const widthValue = Number(widthInput)
    if (stationInput.trim() === '' || !Number.isFinite(stationValue)) {
      setFormError('Enter a valid station.')
      return
    }
    if (widthInput.trim() === '' || !Number.isFinite(widthValue)) {
      setFormError('Enter a valid width.')
      return
    }

    // Resolved against the currently active segment first — never a blind
    // "find any segment containing this station" lookup, since two
    // unrelated segments' station ranges can numerically overlap. Only
    // considers a different candidate when the station falls outside the
    // active segment's range (a real segment-boundary crossing).
    const directionCandidates = segmentCandidates.filter((c) => c.direction === selectedDirection)
    const resolved = resolveSegmentForStation(stationValue, directionCandidates, session.activeSegmentId)
    if (!resolved) {
      setFormError(
        `Station ${stationValue} m doesn't fall within any known segment for this project (${selectedDirection}).`,
      )
      return
    }

    // Crossing into a different segment than the one currently loaded —
    // mergedCoverage still reflects the OLD segment, so fetch the new
    // segment's historical coverage fresh rather than checking against
    // stale data. (Today's own interval for the new segment is empty
    // either way: nothing's been queued locally against it yet.)
    let coverageForCheck = mergedCoverage
    if (resolved.id !== session.activeSegmentId) {
      try {
        coverageForCheck = mergeIntervals(await fetchStationCoverageIntervals(resolved.id, today))
      } catch {
        coverageForCheck = []
      }
    }

    // Rejected before ever reaching the queue — landing exactly on a
    // boundary (continuing from where coverage currently ends) is fine,
    // only strictly-inside is blocked.
    const covering = findStrictlyInsideCoverage(stationValue, coverageForCheck)
    if (covering) {
      setFormError(
        `Station ${stationValue} m is already covered (${covering.lo}–${covering.hi} m already recorded). Pick a station outside this range.`,
      )
      return
    }

    setFormError(null)
    setSubmitting(true)
    try {
      // Writes to the local queue immediately (optimistic UI — it shows up
      // in the list right away tagged 'queued') and kicks off a sync
      // attempt in the background. This screen is online-only no longer:
      // if the network is down, the entry stays 'queued' and retries on
      // reconnect / app foreground (see registerSyncListeners). Who this
      // gets attributed to server-side is handled entirely by client.ts's
      // fetch wrapper (X-Claimed-Crew-Member-Id) plus real auth if it
      // exists — this screen never touches that itself.
      await enqueueWidthReading({
        roadSegmentId: resolved.id,
        direction: selectedDirection,
        date: today,
        station: stationValue,
        width: widthValue,
      })

      // Direction-integrity check happens AFTER the reading is committed —
      // its value is only final once submitted, and this reading itself is
      // never rolled back. A violation only blocks further NEW entries in
      // this session until an explicit reset; it resets the persisted
      // proposal state (lastStation), not the queued/synced data.
      if (session.lastStation !== null) {
        const wentBackward = stationValue < session.lastStation
        const wentForward = stationValue > session.lastStation
        const violatesDirection =
          (session.direction === 'ascending' && wentBackward) || (session.direction === 'descending' && wentForward)

        if (violatesDirection) {
          updateSession({
            blocked: true,
            blockMessage: `Station ${stationValue} m moves ${wentBackward ? 'backward' : 'forward'} from ${session.lastStation} m — opposite the declared ${session.direction} direction. That reading has been saved as entered. No further entries are allowed until you end this session.`,
            lastStation: null,
            activeSegmentId: resolved.id,
          })
          setStationInput('')
          setWidthInput('')
          return
        }
      }

      updateSession({ lastStation: stationValue, activeSegmentId: resolved.id })
      setStationInput(String(computeNextStation(stationValue, session.direction)))
      setWidthInput('')
    } catch (err) {
      setFormError(extractErrorMessage(err, 'Failed to queue entry.'))
    } finally {
      setSubmitting(false)
    }
  }

  // The ONLY way session state (direction/last station/active segment/
  // proposal) is ever cleared — not navigation, not app close/reopen, not
  // going offline/online. Both call sites below (the voluntary "End
  // Session" link during normal entry, and the mandatory recovery button
  // after a direction violation) call this exact same function — one
  // action, two entry points, not two separate "end a session"
  // implementations. Never touches width_readings: already-submitted
  // readings are committed (or safely queued offline) independent of
  // session state, exactly as already built — this only clears the local
  // proposal-tracking, and only for this activity+project+direction (a
  // future PavingEntryScreen would call clearSession() from its own
  // useEntrySession('paving', projectId, direction) instance, same pattern,
  // entirely independent key).
  function handleEndSession() {
    clearSession()
    setStationInput('')
    setWidthInput('')
    setFormError(null)
  }

  return (
    <div className="milling-screen">
      <header className="milling-header">
        <h1>Milling Entry</h1>
        {/* Who's identified is already shown in the header's identity pill
            (every route, not just this one) — this only surfaces something
            that pill doesn't: a real problem (fetch error, or genuinely no
            identity at all). */}
        <div className="milling-user">
          {crewMemberError && <span className="milling-user-error">{crewMemberError}</span>}
          {!crewMemberError && !displayName && <span className="milling-user-error">Not signed in</span>}
        </div>
      </header>

      <section className="milling-selectors">
        <label className="milling-field">
          <span>Project</span>
          <select value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)}>
            <option value="">Select project…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.contractNumber} — {p.name}
              </option>
            ))}
          </select>
        </label>

        <label className="milling-field">
          <span>Direction</span>
          <select
            value={selectedDirection}
            onChange={(e) => setSelectedDirection(e.target.value)}
            disabled={!selectedProjectId}
          >
            <option value="">Select direction…</option>
            {availableDirections.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
      </section>

      {ready && (
        <>
          {queuedCount > 0 ? (
            <div className="milling-sync-status milling-sync-pending">{queuedCount} queued, syncing…</div>
          ) : (
            <span className="milling-sync-pill">All synced</span>
          )}

          {!hasIdentity && (
            <p className="milling-identity-required">Select who you are above to start entering readings.</p>
          )}

          {hasIdentity && session.blocked && (
            <div className="milling-session-blocked">
              <p className="milling-session-blocked-message">{session.blockMessage}</p>
              {/* Mandatory recovery path — same handleEndSession as the
                  voluntary "End Session" link in the normal form below. */}
              <button type="button" className="milling-submit" onClick={handleEndSession}>
                End session and start new
              </button>
            </div>
          )}

          {hasIdentity && !session.blocked && session.direction === null && (
            <div className="milling-direction-prompt">
              <div className="milling-direction-buttons">
                <button
                  type="button"
                  className="milling-direction-button"
                  onClick={() => updateSession({ direction: 'ascending' })}
                >
                  Ascending
                </button>
                <button
                  type="button"
                  className="milling-direction-button"
                  onClick={() => updateSession({ direction: 'descending' })}
                >
                  Descending
                </button>
              </div>
            </div>
          )}

          {hasIdentity && !session.blocked && session.direction !== null && (
            <form className="milling-form" onSubmit={handleSubmit}>
              <div className="milling-session-indicator-row">
                <span className="milling-session-indicator">
                  Session: {session.direction === 'ascending' ? 'Ascending' : 'Descending'}
                  {activeSegment && ` · ${activeSegment.highway} ${activeSegment.direction}`}
                </span>
                {/* Same handleEndSession as the direction-violation recovery
                    button below — this is a voluntary version of the exact
                    same action, not a second implementation of "end a
                    session". Either path clears the persisted session
                    (direction/last station/active segment/proposal) and
                    nothing else — already-submitted readings are untouched
                    either way. */}
                <button type="button" className="milling-end-session-link" onClick={handleEndSession}>
                  End Session
                </button>
              </div>

              {activeSegment && coverageError && <p className="milling-error">{coverageError}</p>}
              {activeSegment && mergedCoverage.length > 0 && (
                <p className="milling-coverage-note">
                  Already covered: {mergedCoverage.map((iv) => `${iv.lo}–${iv.hi} m`).join(', ')}
                </p>
              )}

              <label className="milling-field milling-field-large">
                <span>Station (m)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={stationInput}
                  onChange={(e) => setStationInput(e.target.value)}
                  placeholder="0.00"
                />
              </label>

              <label className="milling-field milling-field-large">
                <span>Width (m)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={widthInput}
                  onChange={(e) => setWidthInput(e.target.value)}
                  placeholder="0.00"
                />
              </label>

              {formError && <p className="milling-error">{formError}</p>}

              <button type="submit" className="milling-submit" disabled={submitting}>
                {submitting ? 'Saving…' : 'Add Reading'}
              </button>
            </form>
          )}

          {/* Shown as soon as a session is underway, even before the first
              reading resolves a segment — a zero-entries session should
              show an explicit "nothing yet" state, not a blank gap where
              this content would otherwise be. ExtraAreaForm still needs a
              resolved segment specifically (roadSegmentId/station range),
              so it stays gated on activeSegment below. */}
          {(activeSegment || (hasIdentity && !session.blocked && session.direction !== null)) && (
            <>
              <section className="milling-summary">
                <span>Total area</span>
                <strong>{liveTotalArea.toFixed(2)} m²</strong>
              </section>

              <section className="milling-list">
                {loadingReadings && <p>Loading…</p>}
                {loadError && <p className="milling-error">{loadError}</p>}
                {!loadingReadings && sortedEntries.length === 0 && <p>No entries yet today.</p>}
                <ul>
                  {sortedEntries.map((entry) => {
                    const isSuperseded = entry.supersededBy !== null
                    const canEdit = hasIdentity && entry.status === 'synced' && !isSuperseded
                    return (
                      <li
                        key={entry.localId}
                        className={isSuperseded ? 'milling-entry-superseded' : 'milling-entry'}
                      >
                        <span className="milling-entry-station">{entry.station} m</span>
                        <span className="milling-entry-width">{entry.width} m wide</span>
                        {entry.isCorrection && <span className="milling-badge milling-badge-correction">corrected</span>}
                        {isSuperseded && <span className="milling-badge milling-badge-superseded">superseded</span>}
                        {!isSuperseded && entry.status === 'synced' && (
                          <span className="milling-badge milling-badge-synced">synced</span>
                        )}
                        {!isSuperseded && entry.status === 'queued' && (
                          <span className="milling-badge milling-badge-queued">queued</span>
                        )}
                        {canEdit && (
                          <button
                            type="button"
                            className="milling-edit-button"
                            aria-label="Edit entry"
                            onClick={() => setCorrectingEntry(entry)}
                          >
                            ✏️
                          </button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>

              {activeSegment && (
                <ExtraAreaForm
                  roadSegmentId={activeSegment.id}
                  date={today}
                  hasIdentity={hasIdentity}
                  segmentFromStation={activeSegment.fromStation}
                  segmentToStation={activeSegment.toStation}
                />
              )}
            </>
          )}
        </>
      )}

      {correctingEntry && (
        <CorrectionForm entry={correctingEntry} onClose={() => setCorrectingEntry(null)} />
      )}
    </div>
  )
}
