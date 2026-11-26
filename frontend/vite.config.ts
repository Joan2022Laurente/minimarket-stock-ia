import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const offlineShell = '/index.html?pwa-shell=1';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      workbox: {
        navigateFallback: undefined,
        cleanupOutdatedCaches: true,
        // Use a separate key so the online shell is always revalidated.
        manifestTransforms: [async (manifest) => ({
          manifest: manifest.map((entry) => entry.url === 'index.html' ? { ...entry, url: offlineShell } : entry),
          warnings: [],
        })],
        runtimeCaching: [{
          urlPattern: ({ sameOrigin, request, url }) => sameOrigin && request.mode === 'navigate'
            && /^\/(?:(?:login|inventario|ventas|predicciones)\/?)?$/i.test(url.pathname),
          handler: 'NetworkOnly',
          options: { precacheFallback: { fallbackURL: offlineShell } },
        }],
      },
      manifest: {
        name: 'Minimarket El Buen Vecino POS',
        short_name: 'El Buen Vecino',
        description: 'Punto de venta y control predictivo de inventarios con IA',
        theme_color: '#0B0B0C',
        background_color: '#0B0B0C',
        display: 'standalone',
        orientation: 'portrait-primary',
        icons: [
          {
            src: '/favicon.svg',
            sizes: '192x192 512x512',
            type: 'image/svg+xml'
          }
        ]
      }
    })
  ],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true
      }
    }
  }
});
