import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  build: { outDir: mode === 'live' ? 'dist-live' : 'dist' },
  plugins: [{ name: 'workspace-mode', transformIndexHtml: html => html.replace('<head>', `<head><meta name="workspace-mode" content="${mode === 'live' ? 'live' : 'preview'}">`) }],
}));
