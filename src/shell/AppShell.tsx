import { NavLink, Outlet } from 'react-router-dom'
import { ProfileSelector } from '../components/ProfileSelector'
import { ProjectSelector } from '../components/ProjectSelector'
import { useCurrentProfile } from '../lib/useCurrentProfile'
import './AppShell.css'

// mobilePrimary marks the items shown in the mobile bottom bar — Milling
// and Paving are already reached via Home's rows, and Tracker/History are
// dense, PM-oriented table views better suited to desktop, so the mobile
// bar stays to just Home + Dashboard. Desktop's sidebar always shows every
// item regardless of this flag (see .app-nav-link-mobile-only in
// AppShell.css) — same routes, same codebase, purely a responsive
// visibility change.
const NAV_ITEMS = [
  { to: '/home', label: 'Home', mobilePrimary: true },
  { to: '/dashboard', label: 'Dashboard', mobilePrimary: true },
  { to: '/milling', label: 'Milling', mobilePrimary: false },
  { to: '/paving', label: 'Paving', mobilePrimary: false },
  { to: '/tracker', label: 'Tracker', mobilePrimary: false },
  { to: '/history', label: 'History', mobilePrimary: false },
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
 *
 * ProjectSelector sits next to it — the app-wide current project (see
 * currentProject.ts), same "mounted once in the shell, every screen reads
 * it reactively" shape. Only shown once a profile exists: before that the
 * whole nav/content area is gated anyway (see the identity check below),
 * so there's nothing for a project choice to do yet.
 */
export function AppShell() {
  const profile = useCurrentProfile()

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="app-wordmark">NOVACORE</span>
        <div className="app-header-controls">
          {profile && <ProjectSelector />}
          <ProfileSelector />
        </div>
      </header>

      {profile ? (
        <div className="app-body">
          <nav className="app-nav">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  'app-nav-link' +
                  (item.mobilePrimary ? '' : ' app-nav-link-desktop-only') +
                  (isActive ? ' app-nav-link-active' : '')
                }
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
