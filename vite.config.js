import { defineConfig } from 'vite'

// Deployed to GitHub Pages at https://<user>.github.io/ant/
// The base path must match the repository name so asset URLs resolve.
export default defineConfig({
  base: process.env.PAGES_BASE ?? '/ant/',
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
})
