import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { defineConfig } from 'vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  server: {
    port: 3001
  },
  resolve: {
    tsconfigPaths: true,
    // Clerk's React SDK needs the React 18+ built-in instead of the shim.
    // See https://github.com/TanStack/router/issues/5738
    alias: [
      { find: 'use-sync-external-store/shim/index.js', replacement: 'react' }
    ]
  },
  plugins: [tailwindcss(), tanstackStart(), viteReact()]
})
