import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import tailwindcss from '@tailwindcss/vite';

const isolationHeaders = {
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

const webAssets: ReadonlyArray<readonly [string, string]> = [
  ['coi-serviceworker.js', './coi-serviceworker.js'],
  ['manifest.webmanifest', './manifest.webmanifest'],
  ['icons/nfs2se-32.png', './icons/nfs2se-32.png'],
  ['icons/nfs2se-192.png', './icons/nfs2se-192.png'],
  ['icons/nfs2se-512.png', './icons/nfs2se-512.png'],
];

const emitWebAssets: Plugin = {
  name: 'emit-web-assets',
  apply: 'build',
  generateBundle() {
    for (const [fileName, sourcePath] of webAssets) {
      this.emitFile({
        type: 'asset',
        fileName,
        source: readFileSync(fileURLToPath(new URL(sourcePath, import.meta.url))),
      });
    }
  },
};

export default defineConfig({
  base: './',
  plugins: [tailwindcss(), emitWebAssets],
  publicDir: fileURLToPath(new URL('../../build/web-public', import.meta.url)),
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
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
