import { defineConfig } from 'vite'
import { copyFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'

// The content script bundles src/mapPool.json directly; this copies the same
// file to dist so the popup (plain JS, not bundled) can fetch it at runtime.
// Keeps the default map pool a single source of truth.
function copyMapPool() {
  return {
    name: 'copy-map-pool',
    closeBundle() {
      copyFileSync('src/mapPool.json', 'dist/mapPool.json')
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // CSS is injected from content.js because the manifest only loads the JS file
  plugins: [react(), cssInjectedByJsPlugin(), copyMapPool()],
  build: {
    rollupOptions: {
      input: 'src/content.jsx',
      output: {
        entryFileNames: 'content.js',
        format: 'iife'
      }
    }
  }
})
