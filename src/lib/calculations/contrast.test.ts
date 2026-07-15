/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { colors } from '../../tokens'
import { contrastRatio } from './contrast'

const AAA = 7

// index.css/App.css use their own unrelated --text/--bg/--accent vars, not
// the --color-* design tokens (App.css is dead — never imported — leftover
// from the Vite starter template). Nothing to scan there.
const SKIP_FILES = new Set(['index.css', 'App.css'])

function findCssFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...findCssFiles(full))
    } else if (entry.endsWith('.css') && !SKIP_FILES.has(entry)) {
      out.push(full)
    }
  }
  return out
}

function kebabToCamel(s: string): string {
  return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
}

/** Resolves a CSS color value (var(--color-x) or a literal hex) to a hex string, or null if unresolvable (rgba/transparent/inherit/etc). */
function resolveColor(value: string): string | null {
  const v = value.trim()
  const varMatch = v.match(/^var\(--color-([\w-]+)(?:\s*,.*)?\)$/)
  if (varMatch) {
    const key = kebabToCamel(varMatch[1]) as keyof typeof colors
    return colors[key] ?? null
  }
  if (/^#[0-9a-fA-F]{3}$|^#[0-9a-fA-F]{6}$/.test(v)) return v
  return null
}

interface Pairing {
  source: string
  fg: string
  bg: string
  exempt?: string
}

/**
 * Auto-discovers every same-rule `color` + `background`/`background-color`
 * pairing across all CSS under src/ — this is the dominant pattern this
 * codebase already uses for badges (background + text color declared
 * together in one class), so a future Paving badge that follows the same
 * convention gets checked automatically, with no test changes required.
 * It cannot see pairings split across a parent/child rule (e.g. a card
 * setting the background and a nested element setting the text color) —
 * those are added explicitly below, with a comment explaining why each one
 * isn't auto-detectable.
 */
function discoverSameRulePairings(): Pairing[] {
  const srcDir = join(import.meta.dirname, '../..')
  const pairings: Pairing[] = []
  for (const file of findCssFiles(srcDir)) {
    const path = file.slice(srcDir.length + 1)
    const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const [, selectorRaw, body] = match
      const selector = selectorRaw.trim().replace(/\s+/g, ' ')
      let fg: string | null = null
      let bg: string | null = null
      for (const declRaw of body.split(';')) {
        const decl = declRaw.trim()
        if (decl.startsWith('color:')) {
          fg = resolveColor(decl.slice('color:'.length))
        } else if (decl.startsWith('background-color:')) {
          bg = resolveColor(decl.slice('background-color:'.length))
        } else if (decl.startsWith('background:')) {
          bg = resolveColor(decl.slice('background:'.length))
        }
      }
      if (fg && bg) {
        pairings.push({ source: `${path} ${selector}`, fg, bg })
      }
    }
  }
  return pairings
}

// Pairings where the background and text color are declared on different
// rules (a parent card's background, a child/pseudo-class's text color) —
// the flat same-rule scanner above can't see the cascade, so these are
// listed explicitly. Each one names the two real rules involved.
const CROSS_RULE_PAIRINGS: Pairing[] = [
  {
    source: 'DashboardScreen.css .dashboard-error / AppShell.css .app-shell bg',
    fg: colors.redDark,
    bg: colors.bg,
  },
  {
    source: 'TrackerScreen.css .tracker-error / AppShell.css .app-shell bg',
    fg: colors.redDark,
    bg: colors.bg,
  },
  {
    source: 'MillingEntryScreen.css .milling-user-error / .milling-screen bg',
    fg: colors.redDark,
    bg: colors.panel,
  },
  {
    source: 'MillingEntryScreen.css .milling-error / .milling-form bg',
    fg: colors.redDark,
    bg: colors.panel,
  },
  {
    source: 'MillingEntryScreen.css .milling-identity-required / .milling-screen bg',
    fg: colors.redDark,
    bg: colors.panel,
  },
  {
    source: 'MillingEntryScreen.css .milling-end-session-link / .milling-form bg',
    fg: colors.redDark,
    bg: colors.panel,
  },
  {
    source: 'MillingEntryScreen.css .milling-session-blocked-message / .milling-session-blocked bg',
    fg: colors.redDark,
    bg: colors.redLight,
  },
  {
    source: 'TrackerScreen.css .tracker-untracked-cell / .tracker-table-wrap bg',
    fg: colors.orangeDark,
    bg: colors.panel,
  },
  {
    source: 'AppShell.css .app-nav-link-active / .app-nav bg',
    fg: colors.periwinkle,
    bg: colors.navyDark,
  },
  {
    source: 'PwaUpdatePrompt.css .pwa-update-reload / .pwa-update-banner bg',
    fg: colors.periwinkle,
    bg: colors.navy,
  },
  {
    source: 'PwaUpdatePrompt.css .pwa-update-dismiss / .pwa-update-banner bg',
    fg: '#FFFFFF',
    bg: colors.navy,
  },
  // indigo/oceanBlue heading- and link-style text — introduced by the
  // Vektor palette swap for text-on-light contexts (see tokens.ts) — are
  // always declared on a different rule from the background they actually
  // sit on (a page/card wrapper several levels up), so none of these are
  // auto-discoverable either.
  {
    source: 'MillingEntryScreen.css .milling-header h1 / .milling-screen bg',
    fg: colors.indigo,
    bg: colors.panel,
  },
  {
    source: 'MillingEntryScreen.css .milling-correction-form h2 / .milling-correction-form bg',
    fg: colors.indigo,
    bg: colors.panel,
  },
  {
    source: 'MillingEntryScreen.css .milling-change-context-icon / .milling-screen bg',
    fg: colors.oceanBlue,
    bg: colors.panel,
  },
  {
    source: 'MillingHomeScreen.css .milling-home-history h2 / app-shell bg',
    fg: colors.indigo,
    bg: colors.bg,
  },
  {
    source: 'MillingHomeScreen.css .milling-home-day-title / app-shell bg',
    fg: colors.indigo,
    bg: colors.bg,
  },
  {
    source: 'MillingHomeScreen.css .milling-home-start-link-back / app-shell bg',
    fg: colors.oceanBlue,
    bg: colors.bg,
  },
  {
    source: 'MillingHomeScreen.css .milling-home-day-area / .milling-home-day-group bg',
    fg: colors.periwinkleDark,
    bg: colors.panel,
  },
  {
    source: 'MillingHomeScreen.css .milling-home-resume-button / .milling-home-day-group bg',
    fg: colors.oceanBlue,
    bg: colors.panel,
  },
  {
    source: 'TrackerScreen.css .tracker-project-code / app-shell bg',
    fg: colors.indigo,
    bg: colors.bg,
  },
  {
    source: 'DashboardScreen.css .dashboard-project-code / app-shell bg',
    fg: colors.indigo,
    bg: colors.bg,
  },
  {
    source: 'DashboardScreen.css .dashboard-section-title / app-shell bg',
    fg: colors.indigo,
    bg: colors.bg,
  },
  {
    source: 'DashboardScreen.css .dashboard-stat-value / .dashboard-stat-card bg',
    fg: colors.periwinkleDark,
    bg: colors.panel,
  },
  // Disabled controls: WCAG 1.4.3 explicitly excludes text that is part of
  // an inactive UI component, so these are intentionally allowed to stay
  // below AAA rather than darkened into looking "active."
  {
    source: 'MillingEntryScreen.css .milling-submit:disabled / white text',
    fg: '#FFFFFF',
    bg: colors.muted,
    exempt: 'disabled control (WCAG 1.4.3)',
  },
  {
    source: 'ExtraAreaForm.css .extra-area-toggle:disabled',
    fg: '#7A7A7A',
    bg: '#FFFFFF',
    exempt: 'disabled control (WCAG 1.4.3)',
  },
]

describe('WCAG contrast — every color pairing actually used in the CSS', () => {
  const discovered = discoverSameRulePairings()
  const all = [...discovered, ...CROSS_RULE_PAIRINGS]

  it('found a non-trivial number of pairings (scanner sanity check)', () => {
    // Guards against the scanner silently finding nothing (e.g. a path or
    // regex regression) and every test below vacuously passing.
    expect(discovered.length).toBeGreaterThan(15)
  })

  it.each(all.map((p) => [p.source, p] as const))('%s clears AAA (7:1)', (_label, p) => {
    const ratio = contrastRatio(p.fg, p.bg)
    if (p.exempt) {
      // Documented exception, not asserted against AAA — still computed so
      // a future change to these colors is visible in a diff/failure if the
      // exemption itself needs revisiting.
      expect(ratio).toBeGreaterThan(0)
      return
    }
    expect(ratio).toBeGreaterThanOrEqual(AAA)
  })
})
