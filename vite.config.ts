import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Served from a project page on GitHub Pages, so assets need the repo prefix.
  // Overridden to '/' for local dev and any root-domain host.
  base: process.env.DEPLOY_BASE ?? '/',
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2020',
    // Card art is already compressed to webp; leaving it as files rather than
    // inlined base64 keeps the JS bundle small and lets the browser cache art
    // independently of code.
    assetsInlineLimit: 2048,
  },
})
