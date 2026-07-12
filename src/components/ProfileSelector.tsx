import { useEffect, useState } from 'react'
import { fetchActiveCrewMembers, type ActiveCrewMember } from '../lib/supabase/crewMembers'
import { setCurrentProfile } from '../lib/profile'
import { useCurrentProfile } from '../lib/useCurrentProfile'
import './ProfileSelector.css'

/**
 * TEMPORARY UNAUTHENTICATED FALLBACK — see
 * supabase/migrations/20260707110000_fallback_identity.sql.
 *
 * Lets the device "claim" an identity from the list of active crew
 * members — no password, no verification. This is self-asserted, not
 * real login, and is clearly labeled as such. Persists in localStorage
 * across reloads on this device until switched or cleared. Real auth
 * (Google OAuth) will supersede this once it ships.
 */
export function ProfileSelector() {
  const profile = useCurrentProfile()
  const [crewMembers, setCrewMembers] = useState<ActiveCrewMember[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [switching, setSwitching] = useState(false)
  const [selectedId, setSelectedId] = useState('')

  useEffect(() => {
    fetchActiveCrewMembers()
      .then(setCrewMembers)
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Failed to load crew members.'))
  }, [])

  function handleConfirm() {
    const chosen = crewMembers.find((c) => c.id === selectedId)
    if (!chosen) return
    setCurrentProfile(chosen)
    setSwitching(false)
    setSelectedId('')
  }

  const showPicker = !profile || switching

  return (
    <div className="profile-selector">
      <div className="profile-selector-warning">⚠ Unverified identity — not real login</div>

      {!showPicker && profile && (
        <div className="profile-selector-current">
          <span>
            Acting as <strong>{profile.name}</strong> ({profile.role})
          </span>
          <button type="button" onClick={() => setSwitching(true)}>
            Switch
          </button>
        </div>
      )}

      {showPicker && (
        <div className="profile-selector-picker">
          <label>
            <span>Who are you?</span>
            <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              <option value="">Select your name…</option>
              {crewMembers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.role})
                </option>
              ))}
            </select>
          </label>
          {loadError && <p className="profile-selector-error">{loadError}</p>}
          <div className="profile-selector-actions">
            {profile && (
              <button type="button" onClick={() => setSwitching(false)}>
                Cancel
              </button>
            )}
            <button type="button" onClick={handleConfirm} disabled={!selectedId}>
              Confirm
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
