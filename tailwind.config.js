/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#f0f5fa',
          100: '#dce8f3',
          200: '#bdd2e6',
          300: '#92b3d3',
          400: '#5f8dbb',
          500: '#3d6fa3',
          600: '#2d5885',
          700: '#24476c',
          800: '#1a3c5e',
          900: '#16304a',
          950: '#0e1f31'
        },
        gold: {
          50: '#fdf9eb',
          100: '#faf0c8',
          200: '#f5df8d',
          300: '#f0c94f',
          400: '#f0b323',
          500: '#dc9a15',
          600: '#bd760f',
          700: '#975410',
          800: '#7d4315',
          900: '#6a3717',
          950: '#3e1c09'
        }
      },
      fontFamily: {
        sans: ['Inter', 'Sarabun', 'system-ui', 'sans-serif'],
        thai: ['Sarabun', 'Inter', 'system-ui', 'sans-serif']
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' }
        },
        /* Display board motion: enough to feel alive on a wall screen,
           never enough to pull the eye away from the work itself. */
        'rise-in': {
          from: { opacity: '0', transform: 'translateY(14px) scale(0.985)' },
          to: { opacity: '1', transform: 'none' }
        },
        'tick-pop': {
          '0%': { transform: 'scale(0.55)' },
          '60%': { transform: 'scale(1.18)' },
          '100%': { transform: 'scale(1)' }
        },
        'live-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(16,185,129,0.55)' },
          '70%': { boxShadow: '0 0 0 9px rgba(16,185,129,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(16,185,129,0)' }
        },
        sheen: {
          '0%': { transform: 'translateX(-130%)' },
          '55%,100%': { transform: 'translateX(240%)' }
        },
        /* A new day on the board: its date tile turns over like a desk
           calendar page, a light sweeps across, and the banner glows once. */
        'day-flip': {
          '0%': { transform: 'perspective(600px) rotateX(-100deg)', opacity: '0' },
          '55%': { transform: 'perspective(600px) rotateX(14deg)', opacity: '1' },
          '80%': { transform: 'perspective(600px) rotateX(-5deg)' },
          '100%': { transform: 'perspective(600px) rotateX(0deg)' }
        },
        'day-sweep': {
          '0%': { transform: 'translateX(-120%) skewX(-14deg)', opacity: '0' },
          '15%': { opacity: '1' },
          '100%': { transform: 'translateX(380%) skewX(-14deg)', opacity: '0' }
        },
        'day-glow': {
          '0%': { transform: 'scale(0.975)', boxShadow: '0 0 0 0 var(--day-glow)' },
          '40%': { transform: 'scale(1.012)' },
          '100%': { transform: 'scale(1)', boxShadow: '0 0 0 18px rgba(255,255,255,0)' }
        }
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-up': 'slide-up 0.25s ease-out',
        'scale-in': 'scale-in 0.15s ease-out',
        'rise-in': 'rise-in 0.42s cubic-bezier(0.22, 1, 0.36, 1) both',
        'tick-pop': 'tick-pop 0.28s ease-out',
        'live-ring': 'live-ring 2.4s ease-out infinite',
        sheen: 'sheen 3.2s ease-in-out infinite',
        'day-flip': 'day-flip 0.75s cubic-bezier(0.2, 0.8, 0.2, 1)',
        'day-sweep': 'day-sweep 0.9s ease-out 0.1s both',
        'day-glow': 'day-glow 0.75s ease-out'
      }
    }
  },
  plugins: []
};
