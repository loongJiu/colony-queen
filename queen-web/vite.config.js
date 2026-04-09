import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/admin': 'http://127.0.0.1:9009',
      '/health': 'http://127.0.0.1:9009',
      '/task': {
        target: 'http://127.0.0.1:9009',
        // /tasks/:taskId 是前端路由，不要代理到后端
        bypass: (req) => {
          if (req.url?.startsWith('/tasks')) return req.url
        }
      }
    }
  }
})
