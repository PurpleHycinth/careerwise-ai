import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['pdfjs-dist'],   // ← pdfjs-dist 5.x breaks Vite 7 pre-bundling
  },
  build: {
    rollupOptions: {
      external: [],            // keep empty — just needed to isolate the issue
    },
  },
  server: {
    proxy: {
      '/upload':  'http://backend:8000',   // use service name, not 127.0.0.1
      '/analyze': 'http://backend:8000',
    },
  },
})