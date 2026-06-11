import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'

// https://vite.dev/config/
export default defineConfig({
  // CSS is injected from content.js because the manifest only loads the JS file
  plugins: [react(), cssInjectedByJsPlugin()],
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