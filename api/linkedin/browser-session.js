import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

function getUserId(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    return decoded.userId;
  } catch {
    return null;
  }
}

/**
 * Conectar a CDP de Browserless via WebSocket nativo (Node 18+)
 * Envía un comando CDP y espera la respuesta
 */
function sendCDP(wsUrl, method, params = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const id = 1;
    let done = false;

    ws.onopen = () => {
      ws.send(JSON.stringify({ id, method, params }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.id === id) {
          done = true;
          ws.close();
          resolve(msg.result);
        }
      } catch { /* ignorar */ }
    };

    ws.onerror = (err) => {
      if (!done) reject(new Error('CDP WebSocket error: ' + err.message));
    };

    ws.onclose = () => {
      if (!done) reject(new Error('CDP WebSocket cerrado sin respuesta'));
    };

    setTimeout(() => {
      if (!done) {
        done = true;
        try { ws.close(); } catch { /* */ }
        reject(new Error('CDP timeout'));
      }
    }, 8000);
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });

  const token = process.env.BROWSERLESS_TOKEN;
  if (!token) {
    return res.status(503).json({ error: 'BROWSERLESS_TOKEN no configurado en Vercel' });
  }

  // POST — crear sesión de browser y navegar a LinkedIn login
  if (req.method === 'POST') {
    try {
      // 1. Crear nueva pestaña en Browserless
      const newPageRes = await fetch(
        `https://chrome.browserless.io/json/new?token=${token}`,
        { method: 'PUT' } // Browserless usa PUT para /json/new
      );

      if (!newPageRes.ok) {
        const text = await newPageRes.text();
        return res.status(502).json({
          error: `Browserless no disponible: ${newPageRes.status} ${text.slice(0, 200)}`
        });
      }

      const page = await newPageRes.json();
      const pageId = page.id;
      // El wsDebuggerUrl viene como ws://... pero necesitamos wss:// para chrome.browserless.io
      const cdpWsUrl = `wss://chrome.browserless.io/devtools/page/${pageId}?token=${token}`;

      // 2. Navegar a LinkedIn login
      await sendCDP(cdpWsUrl, 'Page.navigate', {
        url: 'https://www.linkedin.com/login',
      });

      // 3. Construir la URL del viewer live (DevTools frontend de Browserless)
      const liveViewerUrl =
        `https://chrome.browserless.io/devtools/inspector.html` +
        `?wss=chrome.browserless.io/devtools/page/${pageId}%3Ftoken%3D${token}`;

      // 4. Guardar sessionId en Supabase (temporal) para polling
      await supabaseAdmin.from('linkedin_browser_sessions').upsert({
        user_id: userId,
        page_id: pageId,
        status: 'pending',
        created_at: new Date().toISOString(),
      }, { onConflict: 'user_id' }).select();

      return res.status(200).json({
        success: true,
        pageId,
        liveViewerUrl,
        cdpWsUrl,
      });
    } catch (err) {
      console.error('[BROWSER-SESSION] Error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // DELETE — cerrar sesión
  if (req.method === 'DELETE') {
    const { pageId } = req.body || req.query || {};
    if (pageId) {
      try {
        await fetch(`https://chrome.browserless.io/json/close/${pageId}?token=${token}`, {
          method: 'DELETE'
        });
      } catch { /* ignorar */ }
    }
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Método no permitido' });
}
