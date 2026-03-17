import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx, defineManifest } from '@crxjs/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

const manifest = defineManifest({
  manifest_version: 3,
  name: 'EficacIA Connector',
  version: '1.0.0',
  description: 'Extrae leads de Sales Navigator directamente a tus campañas de EficacIA.',
  icons: {
    '16': 'icons/icon16.png',
    '32': 'icons/icon32.png',
    '48': 'icons/icon48.png',
    '128': 'icons/icon128.png',
  },
  action: {
    default_popup: 'index.html',
  },
  background: {
    service_worker: 'src/background.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['https://*.linkedin.com/sales/search/people*'],
      js: ['src/content.ts'],
    },
  ],
  permissions: ['storage', 'activeTab', 'scripting'],
  host_permissions: ['https://*.linkedin.com/*'],
})

export default defineConfig({
  root: 'eficacia-extension',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
  plugins: [
    tailwindcss(),
    react(),
    crx({ manifest }),
  ],
  build: {
    outDir: '../dist-extension',
    emptyOutDir: true,
  }
})
