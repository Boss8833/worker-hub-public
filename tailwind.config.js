/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#070B1F', surface: '#0E1433', brand: '#8B5CF6', accent: '#22D3EE', teal: '#2DD4BF',
        ok: '#34D399', warn: '#FBBF24', bad: '#F87171', info: '#60A5FA', muted: '#94A3B8',
      },
      fontFamily: { sans: ['Tajawal', 'Inter', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};
