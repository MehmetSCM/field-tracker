import { useEffect, useMemo, useState } from 'react'
import { ExtraAreaForm } from '../../components/ExtraAreaForm'
import { findStrictlyInsideCoverage, mergeIntervals, type Interval } from '../../lib/calculations/intervalCoverage'
import { calculateSegments, cumulativeArea } from '../../lib/calculations/segmentArea'
import { db, type QueuedWidthReading } from '../../lib/db'
import {
  fetchCurrentCrewMember,
  fetchProjects,
  fetchRoadSegmentGroups,
  fetchRoadSegments,
  fetchStationCoverageIntervals,
  type CurrentCrewMember,
  type ProjectOption,
  type RoadSegmentGroupOption,
  type RoadSegmentOption,
} from '../../lib/supabase/milling'
import {
  enqueueWidthReading,
  importServerReadings,
  registerSyncListeners,
} from '../../lib/sync/widthReadingsSync'
import { useLiveQuery } from '../../lib/sync/useLiveQuery'
import { useCurrentProfile } from '../../lib/useCurrentProfile'
import { CorrectionForm } from './CorrectionForm'
import './MillingEntryScreen.css'

function todayLocalDateString(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

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

type SessionDirection = 'ascending' | 'descending'

/**
 * Uniform for both a clean multiple-of-50 last station and an irregular
 * one — floor/ceil to the next full 50 in the declared direction, not a
 * simple +/-50, so an irregular reading (e.g. 28,537) still proposes a
 * clean round number (28,550) rather than another irregular one.
 */
function computeNextStation(lastStation: number, direction: SessionDirection): number {
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

  const [segmentGroups, setSegmentGroups] = useState<RoadSegmentGroupOption[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState('')

  const [segments, setSegments] = useState<RoadSegmentOption[]>([])
  const [selectedSegmentId, setSelectedSegmentId] = useState('')

  const [loadingReadings, setLoadingReadings] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [stationInput, setStationInput] = useState('')
  const [widthInput, setWidthInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Fresh every session, deliberately never persisted (not localStorage, not
  // the DB) — asked fresh every time a segment is (re)selected or a session
  // is explicitly ended. sessionLastStation tracks the last station
  // committed IN THIS SESSION only (not the day's history), since the first
  // reading of a session always requires manual entry with no proposal.
  const [sessionDirection, setSessionDirection] = useState<SessionDirection | null>(null)
  const [sessionLastStation, setSessionLastStation] = useState<number | null>(null)
  const [sessionBlocked, setSessionBlocked] = useState(false)
  const [sessionBlockMessage, setSessionBlockMessage] = useState<string | null>(null)

  // [lo, hi] per prior day with active readings on this segment — merged
  // with today's live interval (from activeEntries, below) to check new
  // stations against. Excludes today's own date since that comes from the
  // live local queue instead, which reflects not-yet-synced entries this
  // server fetch wouldn't have yet.
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
    setSelectedGroupId('')
    setSegmentGroups([])
    if (!selectedProjectId) return
    fetchRoadSegmentGroups(selectedProjectId).then(setSegmentGroups)
  }, [selectedProjectId])

  useEffect(() => {
    setSelectedSegmentId('')
    setSegments([])
    if (!selectedGroupId) return
    fetchRoadSegments(selectedGroupId).then(setSegments)
  }, [selectedGroupId])

  // Every segment (re)selection starts a brand-new session — direction gets
  // asked fresh, no proposal carries over. Also (re)loads this segment's
  // historical station coverage.
  useEffect(() => {
    setSessionDirection(null)
    setSessionLastStation(null)
    setSessionBlocked(false)
    setSessionBlockMessage(null)
    setStationInput('')
    setWidthInput('')
    setFormError(null)
    setHistoricalIntervals([])
    setCoverageError(null)

    if (!selectedSegmentId) return
    fetchStationCoverageIntervals(selectedSegmentId, today)
      .then(setHistoricalIntervals)
      .catch((err) => setCoverageError(extractErrorMessage(err, 'Failed to load station coverage.')))
  }, [selectedSegmentId])

  // Pull today's server-confirmed rows into the local queue table once per
  // segment selection. After this, the running list reads entirely from
  // Dexie (via useLiveQuery below) — server rows and locally-queued rows
  // live in the same local table, so there's nothing to reconcile between
  // "the fetched list" and "the queue".
  useEffect(() => {
    if (!selectedSegmentId) return
    setLoadingReadings(true)
    setLoadError(null)
    importServerReadings(selectedSegmentId, today)
      .catch((err) => setLoadError(extractErrorMessage(err, 'Failed to load entries.')))
      .finally(() => setLoadingReadings(false))
  }, [selectedSegmentId])

  const selectedSegment = segments.find((s) => s.id === selectedSegmentId) ?? null

  const allEntries = useLiveQuery(
    () =>
      selectedSegmentId
        ? db.widthReadingsQueue
            .where('roadSegmentId')
            .equals(selectedSegmentId)
            .filter((r) => r.date === today)
            .toArray()
        : Promise.resolve([]),
    [selectedSegmentId],
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
  // historicalIntervals (a one-time server fetch per segment selection).
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
    if (!selectedSegment || !hasIdentity || !sessionDirection || sessionBlocked) return

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

    // Rejected before ever reaching the queue — landing exactly on a
    // boundary (continuing from where coverage currently ends) is fine,
    // only strictly-inside is blocked.
    const covering = findStrictlyInsideCoverage(stationValue, mergedCoverage)
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
        roadSegmentId: selectedSegment.id,
        direction: selectedSegment.direction,
        date: today,
        station: stationValue,
        width: widthValue,
      })

      // Direction-integrity check happens AFTER the reading is committed —
      // its value is only final once submitted, and this reading itself is
      // never rolled back. A violation only blocks further NEW entries in
      // this session until an explicit reset; it resets the live proposal
      // state (sessionLastStation), not the queued/synced data.
      if (sessionLastStation !== null) {
        const wentBackward = stationValue < sessionLastStation
        const wentForward = stationValue > sessionLastStation
        const violatesDirection =
          (sessionDirection === 'ascending' && wentBackward) || (sessionDirection === 'descending' && wentForward)

        if (violatesDirection) {
          setSessionBlocked(true)
          setSessionBlockMessage(
            `Station ${stationValue} m moves ${wentBackward ? 'backward' : 'forward'} from ${sessionLastStation} m — opposite the declared ${sessionDirection} direction. That reading has been saved as entered. No further entries are allowed until you end this session.`,
          )
          setSessionLastStation(null)
          setStationInput('')
          setWidthInput('')
          return
        }
      }

      setSessionLastStation(stationValue)
      setStationInput(String(computeNextStation(stationValue, sessionDirection)))
      setWidthInput('')
    } catch (err) {
      setFormError(extractErrorMessage(err, 'Failed to queue entry.'))
    } finally {
      setSubmitting(false)
    }
  }

  function handleEndSession() {
    setSessionDirection(null)
    setSessionLastStation(null)
    setSessionBlocked(false)
    setSessionBlockMessage(null)
    setStationInput('')
    setWidthInput('')
    setFormError(null)
  }

  return (
    <div className="milling-screen">
      <header className="milling-header">
        <h1>Milling Entry</h1>
        <div className="milling-user">
          {crewMemberError && <span className="milling-user-error">{crewMemberError}</span>}
          {!crewMemberError && displayName && <span>{displayName}</span>}
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
          <span>Segment</span>
          <select
            value={selectedGroupId}
            onChange={(e) => setSelectedGroupId(e.target.value)}
            disabled={!selectedProjectId}
          >
            <option value="">Select segment…</option>
            {segmentGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.highway} ({g.fromStation}–{g.toStation})
              </option>
            ))}
          </select>
        </label>

        <label className="milling-field">
          <span>Direction</span>
          <select
            value={selectedSegmentId}
            onChange={(e) => setSelectedSegmentId(e.target.value)}
            disabled={!selectedGroupId}
          >
            <option value="">Select direction…</option>
            {segments.map((s) => (
              <option key={s.id} value={s.id}>
                {s.direction}
              </option>
            ))}
          </select>
        </label>
      </section>

      {selectedSegment && (
        <>
          <div className={queuedCount > 0 ? 'milling-sync-status milling-sync-pending' : 'milling-sync-status milling-sync-clear'}>
            {queuedCount > 0 ? `${queuedCount} queued, syncing…` : 'All synced'}
          </div>

          {!hasIdentity && (
            <p className="milling-identity-required">Select who you are above to start entering readings.</p>
          )}

          {hasIdentity && sessionBlocked && (
            <div className="milling-session-blocked">
              <p className="milling-session-blocked-message">{sessionBlockMessage}</p>
              <button type="button" className="milling-submit" onClick={handleEndSession}>
                End session and start new
              </button>
            </div>
          )}

          {hasIdentity && !sessionBlocked && sessionDirection === null && (
            <div className="milling-direction-prompt">
              <p className="milling-direction-prompt-label">Which direction are you walking?</p>
              <div className="milling-direction-buttons">
                <button
                  type="button"
                  className="milling-direction-button"
                  onClick={() => setSessionDirection('ascending')}
                >
                  Ascending
                </button>
                <button
                  type="button"
                  className="milling-direction-button"
                  onClick={() => setSessionDirection('descending')}
                >
                  Descending
                </button>
              </div>
            </div>
          )}

          {hasIdentity && !sessionBlocked && sessionDirection !== null && (
            <form className="milling-form" onSubmit={handleSubmit}>
              <div className="milling-session-indicator">
                Session: {sessionDirection === 'ascending' ? 'Ascending' : 'Descending'}
              </div>

              {coverageError && <p className="milling-error">{coverageError}</p>}
              {mergedCoverage.length > 0 && (
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

          <ExtraAreaForm
            roadSegmentId={selectedSegment.id}
            date={today}
            hasIdentity={hasIdentity}
            segmentFromStation={selectedSegment.fromStation}
            segmentToStation={selectedSegment.toStation}
          />
        </>
      )}

      {correctingEntry && (
        <CorrectionForm entry={correctingEntry} onClose={() => setCorrectingEntry(null)} />
      )}
    </div>
  )
}
