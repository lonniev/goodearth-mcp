import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import { agentGuide } from '@tollbooth-dpyc/web/agent-guide'
import { agentGuideOptions } from './src/lib/agentGuideOptions'
import { aiCatalogOf } from './src/lib/aiCatalog'
import type { Plugin } from 'vite'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

// Short git commit SHA at build time. Cloudflare Pages injects
// CF_PAGES_COMMIT_SHA; CI sets COMMIT_SHA; local dev falls back to
// `git rev-parse`; last resort is "dev" so the footer never renders
// undefined.
function resolveCommit(): string {
  if (process.env.CF_PAGES_COMMIT_SHA) return process.env.CF_PAGES_COMMIT_SHA.slice(0, 7)
  if (process.env.COMMIT_SHA) return process.env.COMMIT_SHA.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return 'dev'
  }
}

// The AI catalog is written from ../server.json at every build, never kept by hand.
function aiCatalog(): Plugin {
  return {
    name: 'ai-catalog',
    generateBundle() {
      const server = JSON.parse(readFileSync('../server.json', 'utf-8'))
      this.emitFile({
        type: 'asset',
        fileName: '.well-known/ai-catalog.json',
        source: JSON.stringify(aiCatalogOf(server), null, 2) + '\n',
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), agentGuide(agentGuideOptions), aiCatalog()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_COMMIT__: JSON.stringify(resolveCommit()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: { outDir: 'dist' },
})
