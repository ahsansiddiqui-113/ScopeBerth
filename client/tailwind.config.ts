import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { brand: 'rgb(var(--brand) / <alpha-value>)' },
    },
  },
  plugins: [],
};
export default config;
