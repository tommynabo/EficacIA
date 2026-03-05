// EficacIA LinkedIn Connector - Content Script
// Se inyecta en el dominio de la app (vercel.app / localhost)
// Actúa de puente entre la página y el background service worker

// Avisar a la página que la extensión está instalada
function announce() {
  window.postMessage({ type: 'EFICACIA_EXT_READY', version: '1.0.0' }, '*');
}

// Anunciar inmediatamente y también al DOM estar listo (por si el framework tarda)
announce();
if (document.readyState !== 'complete') {
  window.addEventListener('load', announce, { once: true });
}

// Escuchar peticiones de la página
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (!event.data || !event.data.type) return;

  // Ping: la página quiere saber si la extensión está instalada
  if (event.data.type === 'EFICACIA_PING') {
    announce();
    return;
  }

  // Petición de cookie li_at
  if (event.data.type === 'EFICACIA_GET_LI_AT') {
    const requestId = event.data.requestId;

    chrome.runtime.sendMessage({ action: 'getLiAt' }, (response) => {
      if (chrome.runtime.lastError) {
        window.postMessage({
          type: 'EFICACIA_LI_AT_RESPONSE',
          requestId,
          success: false,
          error: chrome.runtime.lastError.message,
        }, '*');
        return;
      }

      window.postMessage({
        type: 'EFICACIA_LI_AT_RESPONSE',
        requestId,
        ...response,
      }, '*');
    });
  }
});


// Escuchar peticiones de la página
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (!event.data || event.data.type !== 'EFICACIA_GET_LI_AT') return;

  const requestId = event.data.requestId;

  chrome.runtime.sendMessage({ action: 'getLiAt' }, (response) => {
    if (chrome.runtime.lastError) {
      window.postMessage({
        type: 'EFICACIA_LI_AT_RESPONSE',
        requestId,
        success: false,
        error: chrome.runtime.lastError.message,
      }, '*');
      return;
    }

    window.postMessage({
      type: 'EFICACIA_LI_AT_RESPONSE',
      requestId,
      ...response,
    }, '*');
  });
});
