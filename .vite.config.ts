import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: path.resolve(__dirname, ''),
  base: '/', // öffentliches Basis‑Verzeichnis
  build: {
    outDir: path.resolve(__dirname, 'public'),
    emptyOutDir: true,
  },
});
