import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const isolationHeaders = {
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

const serviceWorkerPath = fileURLToPath(new URL('./coi-serviceworker.js', import.meta.url));

const emitIsolationServiceWorker = {
  name: 'emit-isolation-service-worker',
  apply: 'build',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'coi-serviceworker.js',
      source: readFileSync(serviceWorkerPath, 'utf8'),
    });
  },
};

export default defineConfig({
  base: './',
  plugins: [emitIsolationServiceWorker],
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
