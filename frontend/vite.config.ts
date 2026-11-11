import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'favicon-96.png', 'apple-touch-icon.png', 'logo-campolargo.png'],
      manifest: {
        name: 'Sistema Campolargo — Gestión Veterinaria',
        short_name: 'Campolargo',
        description: 'Sistema de información para la gestión veterinaria de la Sucesión Joao Campolargo',
        theme_color: '#166534',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        lang: 'es',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
        categories: ['productivity', 'utilities'],
        shortcuts: [
          { name: 'Registrar Animal', url: '/animales/nuevo', icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }] },
          { name: 'Ver Alertas', url: '/alertas', icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }] },
        ],
      },
      workbox: {
        // Estrategia de caché para la PWA
        runtimeCaching: [
          {
            // Cache-First para assets estáticos
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Network-First para la API (con fallback a caché). Ojo: la API
            // ya no usa prefijo /v1 (se quitó hace varios commits) — este
            // patrón debe coincidir con la URL real que arma clienteAxios,
            // sea local (http://localhost:3001/api/...) o en producción
            // (https://.../api/...), o el service worker nunca cachea nada.
            urlPattern: /\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
              networkTimeoutSeconds: 10,
            },
          },
        ],
        // Precachear páginas principales para funcionamiento offline
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/index.html',
        // El font de material-symbols pesa ~4 MB, por encima del límite por defecto (2 MB)
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],

  resolve: {
    dedupe: ['react', 'react-dom', '@tanstack/react-query'],
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@paginas': path.resolve(__dirname, './src/paginas'),
      '@componentes': path.resolve(__dirname, './src/componentes'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@stores': path.resolve(__dirname, './src/stores'),
      '@servicios': path.resolve(__dirname, './src/servicios'),
      '@tipos': path.resolve(__dirname, './src/tipos'),
      '@utilidades': path.resolve(__dirname, './src/utilidades'),
    },
  },

  optimizeDeps: {
    include: ['@tanstack/react-query', '@tanstack/react-query-devtools'],
  },

  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },

  preview: {
    port: 4173,
    host: true,
    // Permite acceder al preview a través del túnel HTTPS de Cloudflare
    // (necesario para probar la PWA en el teléfono con un contexto seguro).
    allowedHosts: ['.trycloudflare.com'],
  },

  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'query-vendor': ['@tanstack/react-query'],
          'ui-vendor': ['framer-motion', 'lucide-react'],
          'chart-vendor': ['recharts'],
          'map-vendor': ['leaflet', 'react-leaflet'],
        },
      },
    },
  },
});
