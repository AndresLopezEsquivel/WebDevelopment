import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The React UI calls the relative `/api/posts`. In dev, Vite proxies that to the
// backend on :3000 — mirroring the production Node proxy (routes/proxy.js), which
// forwards to the backend's `/` route. So we rewrite `/api/posts` -> `/` here too.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/posts': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/posts/, '/'),
      },
    },
  },
});
