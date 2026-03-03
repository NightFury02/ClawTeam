/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"SF Pro Text"',
          '"Helvetica Neue"', 'Helvetica', 'Arial', 'sans-serif',
        ],
      },
      borderRadius: {
        DEFAULT: '0.625rem',  /* 10px — Apple's standard radius */
        lg: '0.875rem',       /* 14px */
        xl: '1rem',           /* 16px */
        '2xl': '1.25rem',     /* 20px */
      },
      boxShadow: {
        sm: '0 1px 2px rgba(0, 0, 0, 0.04)',
        DEFAULT: '0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.06)',
        md: '0 2px 8px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04)',
        lg: '0 4px 16px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.04)',
        glow: '0 0 0 3px rgba(0, 122, 255, 0.15)',
      },
      backdropBlur: {
        xl: '20px',
        '2xl': '40px',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'status-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
        'status-breathing': {
          '0%, 100%': { opacity: '0.6', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.15)' },
        },
        'ring-pulse': {
          '0%': { boxShadow: '0 0 0 0 var(--ring-color, rgba(34, 197, 94, 0.5))' },
          '70%': { boxShadow: '0 0 0 4px var(--ring-color, rgba(34, 197, 94, 0))' },
          '100%': { boxShadow: '0 0 0 0 var(--ring-color, rgba(34, 197, 94, 0))' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'slide-in-right': {
          '0%': { opacity: '0', transform: 'translateX(16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'dash-flow': {
          to: { strokeDashoffset: '-20' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out',
        'fade-in-up': 'fade-in-up 0.4s ease-out both',
        'scale-in': 'scale-in 0.2s ease-out',
        'status-pulse': 'status-pulse 2s ease-in-out infinite',
        'status-breathing': 'status-breathing 3s ease-in-out infinite',
        'ring-pulse': 'ring-pulse 2s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'slide-in-right': 'slide-in-right 0.3s ease-out',
        'dash-flow': 'dash-flow 1s linear infinite',
      },
      colors: {
        primary: {
          50:  '#f0f5ff',
          100: '#e0ecff',
          200: '#b3d4ff',
          300: '#80b8ff',
          400: '#4d9bff',
          500: '#007AFF',   /* Apple Blue */
          600: '#0066d6',
          700: '#0052ab',
          800: '#003d80',
          900: '#002955',
        },
        /* Override gray to Apple's neutral palette */
        gray: {
          50:  '#f5f5f7',   /* Apple light bg */
          100: '#ebebed',
          200: '#d2d2d7',   /* Apple border/divider */
          300: '#b8b8be',
          400: '#86868b',   /* Apple secondary text */
          500: '#6e6e73',   /* Apple muted text */
          600: '#424245',   /* Apple body text */
          700: '#333336',
          800: '#1d1d1f',   /* Apple heading text */
          900: '#1d1d1f',   /* Apple primary text */
          950: '#0a0a0a',
        },
        /* Status colors — softer, Apple-like pastels */
        green: {
          50:  '#f0faf0',
          100: '#d4f5d4',
          200: '#a8e6a8',
          800: '#1a7a1a',
        },
        red: {
          50:  '#fef5f5',
          100: '#fde0e0',
          200: '#f5b8b8',
          600: '#ff3b30',   /* Apple Red */
          700: '#d63028',
          800: '#a82020',
        },
        yellow: {
          50:  '#fffbf0',
          100: '#fff3d4',
          200: '#ffe5a0',
          600: '#ff9500',   /* Apple Orange */
          700: '#d67d00',
          800: '#8a5200',
        },
        blue: {
          100: '#e0ecff',
          200: '#b3d4ff',
          600: '#007AFF',   /* Apple Blue */
          700: '#0066d6',
          800: '#003d80',
        },
        purple: {
          50:  '#f8f0ff',
          100: '#ede0ff',
          700: '#7b3daf',
          800: '#5e2d91',
          900: '#4a2272',
        },
        orange: {
          100: '#fff0e0',
          600: '#ff9500',   /* Apple Orange */
          700: '#d67d00',
          800: '#8a5200',
        },
        cyan: {
          100: '#e0f7fa',
          800: '#006064',
        },
        indigo: {
          100: '#e8eaf6',
          200: '#c5cae9',
          800: '#283593',
        },
      },
    },
  },
  plugins: [],
}
