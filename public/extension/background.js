// EficacIA LinkedIn Connector - Background Service Worker
// Tiene acceso a chrome.cookies API (puede leer cookies HttpOnly)

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getLiAt') {
    getLiAtCookie().then(sendResponse);
    return true; // indica que la respuesta es asíncrona
  }
  if (message.action === 'ping') {
    sendResponse({ ok: true, version: '1.0.0' });
  }
});

async function getLiAtCookie() {
  try {
    const cookie = await chrome.cookies.get({
      url: 'https://www.linkedin.com',
      name: 'li_at',
    });

    if (!cookie || !cookie.value) {
      return {
        success: false,
        error: 'No se encontró la cookie li_at. Asegúrate de estar logueado en LinkedIn.',
      };
    }

    return {
      success: true,
      liAt: cookie.value,
      expiresAt: cookie.expirationDate
        ? new Date(cookie.expirationDate * 1000).toISOString()
        : null,
    };
  } catch (err) {
    return {
      success: false,
      error: 'Error accediendo a las cookies: ' + err.message,
    };
  }
}
