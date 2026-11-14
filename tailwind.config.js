/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // Brand: deep navy #091434 and blue #2593D2. Contrast (WCAG) noted
      // where a pairing carries text.
      colors: {
        primary: {
          // Brand blue: buttons, active nav, toggles, focus rings, chart bars.
          // Only 3.4:1 on white, so it fills shapes; text in blue uses `text`.
          DEFAULT: '#2593D2',
          // Hover on a blue fill: darker, so white text on it reads better (4.5:1).
          hover: '#1C7DB8',
          // Lighter end of the brand gradient (active nav link, brand tile).
          light: '#4FB0E6',
          // Text on a primary fill: white, set semibold on buttons (3.4:1 on the
          // brand blue, 4.5:1 on hover). Navy (#091434) would be 5.3:1.
          ink: '#FFFFFF',
          // Blue for text-size links and labels: 5.4:1 on white, 4.7:1 on tint.
          text: '#1670A8',
          'text-hover': '#0F5583',
          // Selected backgrounds (rows, chips, list items).
          tint: '#E5F3FB',
          'tint-row': '#F2F9FD',
          'tint-chart': '#A9D6F0',
          // Text on tint: 10.4:1 and 6:1.
          'tint-text': '#0B3A5E',
          'tint-text-2': '#145F8F',
        },
        page: '#EEF3F9',
        surface: '#FFFFFF',
        'surface-subtle': '#F8FAFC',
        line: '#DFE5EE',
        'input-border': '#CBD5E1',
        ink: '#091434',
        // 5.9:1 on white, 5.4:1 on page.
        muted: '#5B6577',
        sidebar: '#091434',
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
        mono: [ '"Kantumruy Pro"', 'sans-serif'],
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
