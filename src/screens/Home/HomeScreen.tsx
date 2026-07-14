import { Link } from 'react-router-dom'
import './HomeScreen.css'

/**
 * The default landing screen — separate from Dashboard on purpose. This is
 * what the app opens to every time: nothing but the entry activities
 * themselves, ordered by expected frequency of use (Milling first, Paving
 * second). No stats, no contract data, nothing to read — just where to tap
 * to start logging something. Anyone who wants to check overall progress
 * instead goes to Dashboard/Tracker via the persistent nav.
 *
 * Paving has no screen yet (that's a separate build), so its row is a
 * disabled "coming soon" state rather than a route that doesn't exist.
 */
export function HomeScreen() {
  return (
    <div className="home-screen">
      <Link to="/milling" className="home-row home-row-active">
        <span className="home-row-label">Milling</span>
      </Link>

      <div className="home-row home-row-disabled" aria-disabled="true">
        <span className="home-row-label">Paving</span>
        <span className="home-row-sublabel">Coming soon</span>
      </div>
    </div>
  )
}
