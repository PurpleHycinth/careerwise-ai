import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react({
      include: '**/*.{jsx,js}',  // ← tell Vite to treat .js as JSX too
    })
  ],
  server: {
    proxy: {
      '/upload': 'http://127.0.0.1:8000',
      '/analyze': 'http://127.0.0.1:8000'
    }
  }
})