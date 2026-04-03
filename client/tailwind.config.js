/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#FBF6EA',
        surface: 'rgba(250,243,226,0.98)',
        'surface-2': 'rgba(244,234,211,0.98)',
        'surface-3': 'rgba(236,224,193,0.98)',
        accent: '#7A3D2C',
        'accent-dim': 'rgba(122,61,44,0.18)',
        alert: '#9A4F3D',
        'alert-dim': 'rgba(154,79,61,0.18)',
        warning: '#485935',
        'warning-dim': 'rgba(72,89,53,0.18)',
        success: '#485935',
        'success-dim': 'rgba(72,89,53,0.18)',
        muted: '#8A6B5B',
        border: 'rgba(122,61,44,0.14)',
        'border-2': 'rgba(122,61,44,0.22)',
        text: {
          primary: '#432016',
          secondary: '#5A4437',
          muted: 'rgba(67,32,22,0.66)',
        },
      },
      fontFamily: {
        display: ['"Burgid"', 'Montserrat', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
        sans: ['Montserrat', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      backgroundImage: {
        'grid-pattern': `linear-gradient(rgba(122,61,44,0.05) 1px, transparent 1px),
          linear-gradient(90deg, rgba(122,61,44,0.05) 1px, transparent 1px)`,
      },
      backgroundSize: {
        'grid': '40px 40px',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-in': 'slideIn 0.3s ease-out',
        'blink': 'blink 1.2s step-start infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: 0, transform: 'translateY(4px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        slideIn: { from: { opacity: 0, transform: 'translateX(-8px)' }, to: { opacity: 1, transform: 'translateX(0)' } },
        blink: { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0 } },
      },
      boxShadow: {
        'accent': '0 0 20px rgba(122,61,44,0.18)',
        'accent-lg': '0 0 40px rgba(122,61,44,0.2)',
        'alert': '0 0 20px rgba(154,79,61,0.18)',
        'card': '0 1px 3px rgba(122,61,44,0.12)',
      },
    },
  },
  plugins: [],
};
