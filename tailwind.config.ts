import type { Config } from 'tailwindcss';

export default {
  content: ['./public/index.html', './public/ts/**/*.ts', './public/js/**/*.js'],
  theme: {
    extend: {
      colors: {
        dark: '#0f0f0f',
      },
    },
  },
  plugins: [],
} satisfies Config;
