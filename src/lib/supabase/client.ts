import { createClient } from '@supabase/supabase-js'
import { getCurrentProfileId } from '../profile'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables')
}

// TEMPORARY UNAUTHENTICATED FALLBACK — see
// supabase/migrations/20260707110000_fallback_identity.sql. Every request
// carries the currently claimed (unverified, self-asserted) profile id as a
// header, so the database can fall back to it when there's no real
// Supabase Auth session. Once a real session exists, the server ignores
// this header entirely — auth.uid() always wins. Read fresh per-request
// (not baked into the client at creation) since the claimed profile can
// change at runtime via the profile picker.
function fetchWithClaimedProfile(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const profileId = getCurrentProfileId()
  const headers = new Headers(init?.headers)
  if (profileId) {
    headers.set('X-Claimed-Crew-Member-Id', profileId)
  }
  return fetch(input, { ...init, headers })
}

// Written out explicitly rather than relying on the (already-true) SDK
// defaults: sessions persist to the device's storage and refresh silently in
// the background, so a signed-in crew member stays logged in indefinitely
// until they explicitly log out.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  global: {
    fetch: fetchWithClaimedProfile,
  },
})
