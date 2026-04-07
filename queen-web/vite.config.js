import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/admin': 'http://127.0.0.1:9009',
      '/health': 'http://127.0.0.1:9009',
      '/task': 'http://127.0.0.1:9009'
    }
  }
})
