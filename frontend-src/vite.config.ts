import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  publicDir: path.resolve(__dirname, '../public'),
  build: {
    outDir: path.resolve(__dirname, '../services/web-application-firewall/html'),
    emptyOutDir: true,
    assetsDir: 'js',
    rollupOptions: {
      output: {
        // All CSS assets get written to css/style.css
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith('.css')) {
            return 'css/style.css';
          }
          // leave other assets (fonts, images) under their default js/ folder
          return 'js/[name]-[hash][extname]';
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    https: {
      key: path.resolve(__dirname, './certs/server.key'),
      cert: path.resolve(__dirname, './certs/server.crt'),
      ca: path.resolve(__dirname, './certs/ca.crt'),
    },
    proxy: {
      '/socket.io': {
        target: 'https://localhost:3000',
        ws: true,
        secure: false,
        changeOrigin: true,
      },
      '/api': { target: 'https://localhost:3000', changeOrigin: true, secure: false },
      '/uploads': {
        target: 'https://localhost:3000', // API Gateway
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
