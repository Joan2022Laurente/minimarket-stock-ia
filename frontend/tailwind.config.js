/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#0A0A0C',
        card: '#141416',
        subcard: '#1C1C1F',
        hovercard: '#222226',
        hero: {
          start: '#FF5B26',
          mid: '#FF4A15',
          end: '#E63900',
        },
        mint: {
          DEFAULT: '#34D399',
          soft: 'rgba(52, 211, 153, 0.15)',
        },
        finYellow: '#FFD21F',
        danger: '#FF4D6A',
        ai: '#9B8CFF',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      borderRadius: {
        'fin-card': '28px',
        'fin-tile': '20px',
        'fin-pill': '9999px',
      },
      boxShadow: {
        hero: '0 24px 60px -15px rgba(255, 74, 21, 0.4)',
        card: '0 10px 30px -10px rgba(0, 0, 0, 0.5)',
      },
    },
  },
  plugins: [],
};
