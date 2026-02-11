/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './client/index.html',
    './client/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'team-a': {
          DEFAULT: '#d64960',
          light: '#f0c4cc',
          dark: '#a83548',
        },
        'team-b': {
          DEFAULT: '#2a9cad',
          light: '#b8e5ec',
          dark: '#1e7380',
        },
        'confidence': {
          high: '#006400',
          medium: '#e1b800',
          low: '#888888',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['Menlo', 'Monaco', 'Courier New', 'monospace'],
      },
      animation: {
        'buzz': 'buzz 0.3s ease-in-out',
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        buzz: {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-5px)' },
          '75%': { transform: 'translateX(5px)' },
        },
      },
    },
  },
  plugins: [],
};
