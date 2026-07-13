import { colors, radius, shadows, spacing, touchTarget, typography } from '../tokens'

function kebab(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

/**
 * tokens.ts is the single source of truth, but plain .css files can't import
 * a TS object — this bridges the two by writing every token onto :root as a
 * CSS custom property once at startup, so CSS can reference var(--color-navy)
 * etc. without duplicating the values.
 */
export function applyDesignTokens(): void {
  const root = document.documentElement.style

  for (const [key, value] of Object.entries(colors)) {
    root.setProperty(`--color-${kebab(key)}`, value)
  }

  root.setProperty('--font-family', typography.fontFamily)
  for (const [key, value] of Object.entries(typography.sizes)) {
    root.setProperty(`--font-size-${key}`, value)
  }
  for (const [key, value] of Object.entries(typography.weights)) {
    root.setProperty(`--font-weight-${key}`, String(value))
  }

  for (const [key, value] of Object.entries(spacing)) {
    root.setProperty(`--space-${key}`, value)
  }
  for (const [key, value] of Object.entries(radius)) {
    root.setProperty(`--radius-${key}`, value)
  }
  for (const [key, value] of Object.entries(shadows)) {
    root.setProperty(`--shadow-${key}`, value)
  }
  for (const [key, value] of Object.entries(touchTarget)) {
    root.setProperty(`--touch-${kebab(key)}`, value)
  }
}
