import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Same-origin in dev via this proxy rather than a cross-origin absolute
    // URL — simpler locally even though the backend's CORS middleware would
    // now allow the direct route too. Production sets VITE_API_URL instead
    // (see src/api/client.js), which is what CORS_ORIGINS on the backend
    // is actually for.
    proxy: {
      "/api": {
        target: process.env.API_PROXY ?? "http://127.0.0.1:8000",
        changeOrigin: true,
        // The Scriptorium's socket reaches the backend through this proxy
        // too; without ws:true Vite answers the upgrade request itself.
        ws: true,
      },
    },
  },
})
