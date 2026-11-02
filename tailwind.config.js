/** @type {import('tailwindcss').Config} */

// Neutrals come from CSS variables (src/index.css) so the whole app can switch theme by redefining
// them. They lean slightly towards the indigo accent instead of a flat grey.
const slate = Object.fromEntries([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((n) => [n, `rgb(var(--slate-${n}) / <alpha-value>)`]));

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { slate },
      fontFamily: {
        sans: ['Geist', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['"Bricolage Grotesque"', 'Geist', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: { '2xl': '18px' },
      // Motion is short and functional: nothing loops, nothing runs longer than ~250ms.
      keyframes: {
        'fade-in': { from: { opacity: '0' } },
        'pop-in': { from: { opacity: '0', transform: 'translateY(4px) scale(.985)' } },
        'slide-in-right': { from: { opacity: '0', transform: 'translateX(24px)' } },
        'rise-in': { from: { opacity: '0', transform: 'translateY(6px)' } },
      },
      animation: {
        'fade-in': 'fade-in 180ms cubic-bezier(.2,.8,.2,1)',
        'pop-in': 'pop-in 180ms cubic-bezier(.2,.8,.2,1)',
        'slide-in-right': 'slide-in-right 240ms cubic-bezier(.2,.8,.2,1)',
        'rise-in': 'rise-in 200ms cubic-bezier(.2,.8,.2,1)',
      },
      transitionTimingFunction: { out: 'cubic-bezier(.2,.8,.2,1)' },
    },
  },
  plugins: [],
};
