export const colors = {
  navy: '#1F3864', navyDark: '#162847', navyLight: '#2E4F7A',
  blue: '#2E75B6', blueLight: '#4A90D9',
  amber: '#F5C518', amberLight: '#FFF2CC', amberDark: '#D4A800',
  green: '#4CAF82', greenLight: '#C6EFCE', greenDark: '#375623',
  orange: '#E07000', orangeLight: '#FFF8F0',
  red: '#E05252', redLight: '#FCE4D6',
  bg: '#F4F6F9', panel: '#FFFFFF', border: '#DDE3EC',
  muted: '#6B7280', text: '#1A1A2E', textLight: '#9CA3AF',
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
