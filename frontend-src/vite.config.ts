import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  publicDir: path.resolve(__dirname, '../public'),
  build: {
    outDir: path.resolve(__dirname, '../services/web-application-firewall/html'),
    emptyOutDir: true,
    assetsDir: 'js',
    rollupOptions: {
      output: {
        // All CSS assets get written to css/style.css
        assetFileNames: assetInfo => {
          if (assetInfo.name?.endsWith('.css')) {
            return 'css/style.css'
          }
          // leave other assets (fonts, images) under their default js/ folder
          return 'js/[name]-[hash][extname]'
        }
      }
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/socket.io': { target: 'http://localhost:3000', ws: true },
      '/api':        { target: 'http://localhost:3000', changeOrigin: true },
    }
  }
})
