import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'brand/focon-colorida.jpeg'],
      manifest: {
        name: 'FoconFlow — Fócon Engenharia',
        short_name: 'FoconFlow',
        description: 'Controle de Produção e Rentabilidade',
        theme_color: '#0d9488',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/brand/focon-colorida.jpeg',
            sizes: '192x192',
            type: 'image/jpeg',
            purpose: 'any',
          },
          {
            src: '/brand/focon-colorida.jpeg',
            sizes: '512x512',
            type: 'image/jpeg',
            purpose: 'any',
          },
          {
            src: '/brand/focon-colorida.jpeg',
            sizes: '512x512',
            type: 'image/jpeg',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Cache only static shell — never cache auth tokens, API responses, or signed URLs
        globPatterns: ['**/*.{js,css,html,svg,jpeg,png,ico,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/api\//, /^\/auth\//, /supabase\.co\//],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
});
