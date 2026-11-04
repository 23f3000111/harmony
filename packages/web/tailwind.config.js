const channel = (name) => `rgb(var(--${name}) / <alpha-value>)`;
const scale = (name) => Object.fromEntries([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((step) => [step, channel(`${name}-${step}`)]));

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: scale('brand'),
        accent: channel('accent'),
        ink: { DEFAULT: channel('ink'), muted: channel('ink-muted'), soft: channel('ink-soft') },
        canvas: channel('canvas'),
        line: channel('line'),
        mint: { 50: '#ecfdf6', 100: '#d1fae9', 400: '#34d399', 500: '#12b886', 600: '#0b9a70', 700: '#087a59' },
        sun: { 50: '#fff8eb', 100: '#ffefc7', 300: '#ffd166', 400: '#ffbe3d', 500: '#f5a314', 600: '#d98500', 700: '#a86400' },
        coral: { 50: '#fff1f2', 100: '#ffe0e4', 400: '#ff7a8a', 500: '#f4506a', 600: '#dc3150', 700: '#b42041' },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans Variable"', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)'],
      },
      fontSize: { body: ['15px', '1.55'], hint: ['12px', '1.4'] },
      borderRadius: { card: '24px', banner: '32px', tile: '16px' },
      boxShadow: {
        soft: '0 1px 2px rgb(var(--shadow) / .05), 0 1px 3px rgb(var(--shadow) / .06)',
        card: '0 1px 2px rgb(var(--shadow) / .04), 0 14px 34px -18px rgb(var(--shadow) / .22)',
        lift: '0 34px 64px -30px rgb(var(--shadow) / .5)',
        glow: '0 14px 34px -12px rgb(var(--brand-600) / .55)',
      },
      maxWidth: { content: '1240px' },
      spacing: { sidebar: '264px' },
      keyframes: {
        'float-a': { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-10px)' } },
        'float-b': { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(8px)' } },
        ring: { '0%': { transform: 'scale(1)', opacity: '.55' }, '100%': { transform: 'scale(1.55)', opacity: '0' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        wave: { '0%': { transform: 'translateX(0)' }, '100%': { transform: 'translateX(-50%)' } },
        drift: { '0%,100%': { transform: 'translate(0,0) scale(1)' }, '50%': { transform: 'translate(24px,-16px) scale(1.08)' } },
      },
      animation: {
        'float-a': 'float-a 8s ease-in-out infinite',
        'float-b': 'float-b 6s ease-in-out infinite',
        ring: 'ring 1.8s cubic-bezier(.2,.7,.3,1) infinite',
        shimmer: 'shimmer 1.6s infinite',
        wave: 'wave 7s linear infinite',
        drift: 'drift 14s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
