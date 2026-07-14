// *Dark tokens are the AAA-safe (>=7:1) text color for the matching *Light
// background — every light-bg/dark-text badge pairing must use *Dark for
// its text, never the base hue, which is calibrated for use as an accent
// (borders, icons, solid fills with white text) and is too light to read
// as body/badge text on its own *Light background. See
// contrast.test.ts for the enforcement.
export const colors = {
  navy: '#1F3864', navyDark: '#162847', navyLight: '#2E4F7A',
  // blueLight used to be #4A90D9 — a medium-bright blue, not a pale tint
  // like every other *Light token (a naming/value bug). Nothing else in
  // the codebase referenced that value, so it's replaced outright rather
  // than preserved under a new name.
  blue: '#2E75B6', blueLight: '#DCE9F5',
  amber: '#F5C518', amberLight: '#FFF2CC', amberDark: '#614D00',
  // greenDark is calibrated purely for AAA text-on-greenLight contrast, and
  // its hue has never actually matched --color-green (152.7° vs
  // greenDark's 96.5°, an unrelated olive) — greenButton is a real dark
  // shade of the SAME green hue, for primary-action button fills (solid
  // background, white text), so a future contrast-driven edit to greenDark
  // can't silently shift the "confirm" button's color again.
  green: '#4CAF82', greenLight: '#C6EFCE', greenDark: '#324F20', greenButton: '#2A6047',
  orange: '#E07000', orangeLight: '#FFF8F0', orangeDark: '#824100',
  red: '#E05252', redLight: '#FCE4D6', redDark: '#8F1A1A',
  bg: '#F4F6F9', panel: '#FFFFFF', border: '#DDE3EC',
  muted: '#48505A', text: '#1A1A2E', textLight: '#9CA3AF',
  inputBg: '#FAFBFD', inputFocus: '#FFFFFF',
} as const;

export const typography = {
  fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
  sizes: { xs: '11px', sm: '12px', base: '14px', md: '15px', lg: '16px',
            xl: '18px', '2xl': '22px', '3xl': '28px' },
  weights: { normal: 400, medium: 500, semibold: 600, bold: 700 },
} as const;

export const spacing = { 1:'4px',2:'8px',3:'12px',4:'16px',5:'20px',6:'24px',8:'32px',10:'40px',12:'48px' } as const;
export const radius = { sm:'4px', md:'6px', lg:'8px', xl:'12px', full:'9999px' } as const;
export const shadows = { sm:'0 1px 3px rgba(0,0,0,0.08)', md:'0 2px 8px rgba(0,0,0,0.10)', lg:'0 4px 16px rgba(0,0,0,0.12)' } as const;
export const touchTarget = { min:'44px', standard:'48px', large:'56px' } as const;

// Applied on top of the base values above whenever the viewport is <=767px
// (see applyDesignTokens.ts) — one place that governs the "smaller and
// tighter on mobile" rule for every screen, present and future (Paving
// included), instead of each screen redoing its own per-element overrides.
// touchTarget.min is deliberately absent here — 44px is the accessibility
// floor and never shrinks further; standard/large still shrink but stay
// at or above it.
export const mobileOverrides = {
  sizes: { base: '13px', md: '14px', lg: '14px', xl: '15px', '2xl': '18px', '3xl': '20px' },
  spacing: { 3: '9px', 4: '12px', 5: '16px', 6: '18px', 8: '24px', 10: '32px', 12: '40px' },
  touchTarget: { standard: '44px', large: '48px' },
} as const;
