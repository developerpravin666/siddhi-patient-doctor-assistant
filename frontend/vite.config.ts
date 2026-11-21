import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Read VITE_API_BASE_URL from frontend/.env (Single Source of Truth)
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = (env.VITE_API_BASE_URL || 'http://localhost:8000').trim().replace(/\/+$/, '')

  return {
    plugins: [react()],
    build: {
      outDir: 'build',
    },
    server: {
      port: 5173,
      host: true,
      // Allow any tunnel host (Cloudflare, ngrok, localhost, LAN) without manual updates
      allowedHosts: true,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
        },
        '/webhook': {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
        }
      }
    }
  }
})
