/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#FF6D29',
          ink: '#17201B',
          text: '#B8470F',
          'text-hover': '#8A3309',
          tint: '#FFEDE3',
          'tint-row': '#FFF5EF',
          'tint-chart': '#FFC4A8',
          'tint-text': '#6E2A08',
          'tint-text-2': '#9A3A0B',
        },
        page: '#F6F4EE',
        surface: '#FFFFFF',
        'surface-subtle': '#FBFAF6',
        line: '#E2DED3',
        'input-border': '#D9D4C7',
        ink: '#17201B',
        muted: '#5A635D',
        sidebar: '#17201B',
        success: { DEFAULT: '#E6F2EB', text: '#165C39' },
        warning: { DEFAULT: '#FEF6D8', text: '#735400' },
        danger: { DEFAULT: '#FBE4E1', text: '#9A1C12', strong: '#B42318' },
      },
      fontFamily: {
        heading: ['"Bricolage Grotesque"', 'sans-serif'],
        body: ['"Kantumruy Pro"', 'sans-serif'],
        // "Kantumruy Pro" as a fallback (not just "monospace") so the
        // Khmer riel sign (៛, U+17DB) — absent from JetBrains Mono —
        // renders as the actual glyph instead of a fallback-font
        // substitute that reads as a stray "$" next to KHR amounts.
        mono: ['"JetBrains Mono"', '"Kantumruy Pro"', 'monospace'],
      },
      borderRadius: {
        control: '10px',
        card: '14px',
        modal: '18px',
      },
    },
  },
  plugins: [],
}
