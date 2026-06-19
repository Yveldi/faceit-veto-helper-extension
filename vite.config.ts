import { defineConfig } from 'vite'
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'

// The pool JSON is bundled into content.js for the content script, but the popup
// (a separate extension page) fetches it at runtime, so it also needs to exist
// as standalone files in dist/. Also copy just the server-country flags the
// popup needs from flagpack-core (the same flag set the content script inlines)
// into dist/flags/, so the popup can show them without duplicating a flag lib.
function copyPoolAssets() {
  return {
    name: 'copy-pool-assets',
    closeBundle() {
      copyFileSync('src/mapPool.json', 'dist/mapPool.json')
      copyFileSync('src/serverPool.json', 'dist/serverPool.json')

      mkdirSync('dist/flags', { recursive: true })
      const servers = JSON.parse(readFileSync('src/serverPool.json', 'utf8'))
      for (const { code } of servers) {
        copyFileSync(
          `node_modules/flagpack-core/svg/s/${code}.svg`,
          `dist/flags/${code}.svg`,
        )
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // CSS is injected from content.js because the manifest only loads the JS file
  plugins: [react(), cssInjectedByJsPlugin(), copyPoolAssets()],
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
