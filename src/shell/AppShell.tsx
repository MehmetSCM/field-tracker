import { NavLink, Outlet } from 'react-router-dom'
import { ProfileSelector } from '../components/ProfileSelector'
import { useCurrentProfile } from '../lib/useCurrentProfile'
import './AppShell.css'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/milling', label: 'Milling' },
  { to: '/paving', label: 'Paving' },
  { to: '/tracker', label: 'Tracker' },
  { to: '/history', label: 'History' },
]

/**
 * Persistent app shell: header (wordmark + identity, on every route) + nav
 * (sidebar on desktop, bottom bar on mobile) around whatever route is
 * active. Identity comes from useCurrentProfile — the claimed-identity
 * fallback, not a real Supabase Auth session — since real login doesn't
 * exist yet. No /login route: with no profile picked, the header's
 * ProfileSelector shows its own picker and the main content area shows a
 * prompt instead of nav/routes, rather than redirecting anywhere.
 *
 * ProfileSelector is mounted exactly once, here. It used to also be
 * embedded directly in MillingEntryScreen (the only screen that existed
 * before this shell); that copy is now removed — this header instance
 * covers every route, including Milling, so the duplicate was dead weight.
 */
export function AppShell() {
  const profile = useCurrentProfile()

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="app-wordmark">FIELD TRACKER</span>
        <ProfileSelector />
      </header>

      {profile ? (
        <div className="app-body">
          <nav className="app-nav">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => 'app-nav-link' + (isActive ? ' app-nav-link-active' : '')}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <main className="app-main">
            <Outlet />
          </main>
        </div>
      ) : (
        <div className="app-shell-gate-content">
          <p>Select who you are above to continue.</p>
        </div>
      )}
    </div>
  )
}
