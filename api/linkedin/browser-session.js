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

async function getOrCreateTeam(userId) {
  const { data: teams } = await supabaseAdmin
    .from('teams').select('id').eq('owner_id', userId).limit(1);
  if (teams && teams.length > 0) return teams[0].id;
  const { data: newTeam } = await supabaseAdmin
    .from('teams').insert({ owner_id: userId, name: 'Mi Equipo' }).select().single();
  return newTeam?.id || null;
}

/**
 * Obtiene cookies y URL actual de la sesión Browserless via CDP
 */
function getSessionState(cdpWsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(cdpWsUrl);
    const results = {};
    let cookiesReceived = false;
    let urlReceived = false;
    let closed = false;

    function tryResolve() {
      if (cookiesReceived && urlReceived && !closed) {
        closed = true;
        try { ws.close(); } catch { /* */ }
        resolve(results);
      }
    }

    ws.onopen = () => {
      ws.send(JSON.stringify({ id: 1, method: 'Network.getCookies' }));
      ws.send(JSON.stringify({ id: 2, method: 'Runtime.evaluate', params: { expression: 'window.location.href' } }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.id === 1) { results.cookies = msg.result?.cookies || []; cookiesReceived = true; tryResolve(); }
        if (msg.id === 2) { results.url = msg.result?.result?.value || ''; urlReceived = true; tryResolve(); }
      } catch { /* */ }
    };

    ws.onerror = () => { if (!closed) { closed = true; reject(new Error('CDP error')); } };
    ws.onclose = () => {
      if (!closed && (!cookiesReceived || !urlReceived)) { closed = true; reject(new Error('CDP cerrado sin resultado')); }
    };
    setTimeout(() => {
      if (!closed) { closed = true; try { ws.close(); } catch { /* */ } reject(new Error('CDP timeout')); }
    }, 8000);
  });
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
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

  // GET — estado de sesión (polling, reemplaza session-status.js)
  if (req.method === 'GET') {
    const { pageId } = req.query;
    if (!pageId) return res.status(400).json({ error: 'pageId requerido' });
    const cdpWsUrl = `wss://chrome.browserless.io/devtools/page/${pageId}?token=${token}`;
    try {
      const { cookies, url } = await getSessionState(cdpWsUrl);
      const liAtCookie = cookies.find(c => c.name === 'li_at');
      const isAtFeed = url && (
        url.includes('linkedin.com/feed') ||
        url.includes('linkedin.com/in/') ||
        url.includes('linkedin.com/my-items') ||
        url.includes('linkedin.com/sales')
      );
      if (!liAtCookie || !isAtFeed) {
        return res.status(200).json({ status: 'pending', url, hasLiAt: !!liAtCookie });
      }
      const liAt = liAtCookie.value;
      let profileName = 'Usuario LinkedIn';
      let publicId = '';
      try {
        const profileRes = await fetch('https://www.linkedin.com/voyager/api/me', {
          headers: {
            Cookie: `li_at=${liAt}; JSESSIONID="ajax:0"`,
            'csrf-token': 'ajax:0',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'x-restli-protocol-version': '2.0.0',
            Accept: 'application/vnd.linkedin.normalized+json+2.1',
          },
        });
        if (profileRes.ok) {
          const data = await profileRes.json();
          const included = data?.included || [];
          const mini = included.find(i => i?.firstName || i?.$type?.includes('MiniProfile'));
          if (mini?.firstName) {
            profileName = `${mini.firstName} ${mini.lastName || ''}`.trim();
            publicId = mini.publicIdentifier || '';
          } else if (data?.miniProfile?.firstName) {
            profileName = `${data.miniProfile.firstName} ${data.miniProfile.lastName || ''}`.trim();
            publicId = data.miniProfile.publicIdentifier || '';
          }
        }
      } catch { /* ignorar */ }
      const teamId = await getOrCreateTeam(userId);
      if (!teamId) return res.status(500).json({ error: 'No se pudo obtener el equipo' });
      const username = publicId || profileName.toLowerCase().replace(/\s+/g, '-') || 'linkedin';
      const { data: existing } = await supabaseAdmin
        .from('linkedin_accounts').select('id').eq('team_id', teamId).eq('username', username).limit(1);
      if (existing && existing.length > 0) {
        await supabaseAdmin.from('linkedin_accounts').update({
          session_cookie: liAt, is_valid: true,
          last_validated_at: new Date().toISOString(), profile_name: profileName,
        }).eq('id', existing[0].id);
      } else {
        await supabaseAdmin.from('linkedin_accounts').insert({
          team_id: teamId, username, profile_name: profileName,
          session_cookie: liAt, is_valid: true, last_validated_at: new Date().toISOString(),
        });
      }
      try {
        await fetch(`https://chrome.browserless.io/json/close/${pageId}?token=${token}`, { method: 'DELETE' });
      } catch { /* ignorar */ }
      return res.status(200).json({
        status: 'connected', profileName,
        message: `✓ Cuenta de ${profileName} conectada exitosamente`,
      });
    } catch (err) {
      console.error('[BROWSER-SESSION GET] Error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Método no permitido' });
}
