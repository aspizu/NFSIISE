import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const isolationHeaders = {
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

export default defineConfig({
  base: './',
  publicDir: fileURLToPath(new URL('../../build/web-public', import.meta.url)),
  server: {
    headers: isolationHeaders,
  },
  preview: {
    headers: isolationHeaders,
  },
  build: {
    emptyOutDir: true,
    outDir: fileURLToPath(new URL('../../build/web', import.meta.url)),
    target: 'es2022',
  },
});
