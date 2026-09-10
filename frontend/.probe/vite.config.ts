import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: '.probe',
  define: { __APP_VERSION__: '"probe"', __BUILD_COMMIT__: '"probe"', __BUILD_TIME__: '"probe"' },
  build: { outDir: '../.probe-dist', emptyOutDir: true },
})
