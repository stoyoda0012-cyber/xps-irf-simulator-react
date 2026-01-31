import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/xps-irf-simulator-react/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        browser: resolve(__dirname, 'browser.html'),
      },
    },
  },
  server: {
    // APIプロキシ（開発時）
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
