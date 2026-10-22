import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    // Component tests need a DOM; everything else (engine, game, store
    // logic) runs faster without one. Keyed on extension rather than a
    // folder so a store's own plain-logic test can sit beside its
    // component test without either dragging the other's environment in.
    environmentMatchGlobs: [['src/**/*.test.tsx', 'jsdom']],
    setupFiles: ['./src/test/setup.ts'],
  },
})
