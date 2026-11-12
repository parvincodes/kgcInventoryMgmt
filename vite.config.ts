import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: Vite serves the UI on :5173 (reachable from your phone) and proxies /api to the server on :3000.
// Prod (`npm start`): the server on :3000 serves the built UI from dist/client.
export default defineConfig({
  root: 'client',
  plugins: [react()],
  build: { outDir: '../dist/client', emptyOutDir: true },
  server: {
    host: true,
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' }
  }
});
