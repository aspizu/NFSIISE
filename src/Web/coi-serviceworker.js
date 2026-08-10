(() => {
  const headers = {
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
  };

  if (typeof window === 'undefined') {
    self.addEventListener('install', () => self.skipWaiting());
    self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
    self.addEventListener('fetch', (event) => {
      if (event.request.cache === 'only-if-cached' && event.request.mode !== 'same-origin')
        return;

      event.respondWith(
        fetch(event.request).then((response) => {
          if (response.status === 0)
            return response;

          const responseHeaders = new Headers(response.headers);
          for (const [name, value] of Object.entries(headers))
            responseHeaders.set(name, value);

          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders,
          });
        }),
      );
    });
    return;
  }

  const reloadKey = 'nfs2se-coi-reloaded';
  if (window.crossOriginIsolated) {
    sessionStorage.removeItem(reloadKey);
    return;
  }

  if (!('serviceWorker' in navigator) || sessionStorage.getItem(reloadKey))
    return;

  const workerUrl = document.currentScript.src;
  navigator.serviceWorker.register(workerUrl, { scope: './' }).then(async () => {
    await navigator.serviceWorker.ready;
    sessionStorage.setItem(reloadKey, 'true');
    window.location.reload();
  }).catch((error) => console.error('Could not enable WebAssembly threads:', error));
})();
