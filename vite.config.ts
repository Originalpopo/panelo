import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Content-Security-Policy for the published app (GitHub Pages can't send headers, so it goes in a <meta>).
 * Only our own scripts run; photos are blob: URLs made in the browser; the only outside things allowed
 * are the Google Fonts stylesheet and font files. Not used in dev — Vite's live reload needs inline scripts.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' blob: data:",
  "connect-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

const csp = (): Plugin => ({
  name: 'panelo-csp',
  apply: 'build',
  transformIndexHtml: (html) => html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
});

// Fixed port so the preview and the phone always find the app at the same address.
// base './' lets the built app run from any folder (e.g. GitHub Pages).
export default defineConfig({
  base: './',
  plugins: [react(), csp()],
  // Polling: the P: drive drops some file-change events, which left the dev server serving old code.
  server: { port: 3004, strictPort: true, host: true, watch: { usePolling: true, interval: 300 } },
  preview: { port: 3004, strictPort: true, host: true },
});
