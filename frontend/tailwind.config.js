/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        canvas: 'rgb(var(--c-canvas) / <alpha-value>)',
        surface: {
          DEFAULT: 'rgb(var(--c-surface) / <alpha-value>)',
          2: 'rgb(var(--c-surface-2) / <alpha-value>)',
          3: 'rgb(var(--c-surface-3) / <alpha-value>)',
        },
        line: {
          DEFAULT: 'rgb(var(--c-line) / <alpha-value>)',
          soft: 'rgb(var(--c-line-soft) / <alpha-value>)',
        },
        ink: {
          DEFAULT: 'rgb(var(--c-ink) / <alpha-value>)',
          muted: 'rgb(var(--c-ink-muted) / <alpha-value>)',
          faint: 'rgb(var(--c-ink-faint) / <alpha-value>)',
        },
        brand: {
          300: '#FF8A66',
          500: '#F24A1B',
          600: '#D93A0E',
        },
        success: {
          DEFAULT: '#5BE49B',
          soft: 'rgb(var(--c-success-soft) / <alpha-value>)',
        },
        warning: {
          DEFAULT: '#FFD21F',
          soft: 'rgb(var(--c-warning-soft) / <alpha-value>)',
        },
        danger: {
          DEFAULT: '#FF4D6A',
          soft: 'rgb(var(--c-danger-soft) / <alpha-value>)',
        },
        ai: {
          DEFAULT: '#9B8CFF',
          soft: 'rgb(var(--c-ai-soft) / <alpha-value>)',
        },
        'on-light': '#0B0B0C',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Manrope', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        label: ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.01em' }],
        kpi: ['2.25rem', { lineHeight: '2.5rem', letterSpacing: '-0.02em', fontWeight: '600' }],
        total: ['3rem', { lineHeight: '3rem', letterSpacing: '-0.03em', fontWeight: '700' }],
      },
      borderRadius: {
        card: '1.5rem',
        tile: '1rem',
        chip: '0.75rem',
      },
      boxShadow: {
        card: 'inset 0 0 0 1px rgb(var(--c-line) / 0.6), 0 8px 24px -12px rgb(0 0 0 / 0.5)',
        hero: '0 24px 60px -20px rgb(242 74 27 / 0.55)',
        pop: '0 30px 80px -20px rgb(0 0 0 / 0.7)',
        focus: '0 0 0 3px rgb(242 74 27 / 0.45)',
      },
      backgroundImage: {
        hatch:
          'repeating-linear-gradient(135deg, rgb(255 255 255 / 0.07) 0 2px, transparent 2px 7px)',
        'hatch-light':
          'repeating-linear-gradient(135deg, rgb(255 255 255 / 0.22) 0 2px, transparent 2px 7px)',
        hero: 'linear-gradient(160deg, #FF5A28 0%, #F24A1B 45%, #E23A0D 100%)',
      },
      transitionTimingFunction: { snap: 'cubic-bezier(.2,.8,.2,1)' },
      keyframes: {
        pop: { '0%': { transform: 'scale(.96)', opacity: '0' }, '100%': { transform: 'scale(1)', opacity: '1' } },
        pulseDot: { '0%,100%': { opacity: '1' }, '50%': { opacity: '.35' } },
      },
      animation: {
        pop: 'pop .16s cubic-bezier(.2,.8,.2,1)',
        'pulse-dot': 'pulseDot 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
