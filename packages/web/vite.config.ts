import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Two builds from one codebase:
 *  default: the app served by the Node server.
 *  pages:   the GitHub Pages demo, where the API runs inside the browser.
 */
export default defineConfig(({ mode }) => {
  const pages = mode === 'pages';
  return {
    plugins: [react()],
    base: pages ? (process.env.PAGES_BASE ?? '/harmony/') : '/',
    define: {
      'import.meta.env.VITE_STATIC_DEMO': JSON.stringify(pages ? 'true' : 'false'),
    },
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    optimizeDeps: { exclude: ['@electric-sql/pglite'] },
    server: {
      port: 5173,
      proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: false } },
    },
    build: { sourcemap: false, chunkSizeWarningLimit: 1600 },
  };
});
