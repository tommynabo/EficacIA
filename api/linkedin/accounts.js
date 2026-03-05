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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });

  // GET - listar cuentas
  if (req.method === 'GET') {
    const { data: accounts, error } = await supabaseAdmin
      .from('linkedin_accounts')
      .select('id, user_id, profile_name, is_valid, created_at, last_validated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ success: true, accounts: accounts || [] });
  }

  // POST - conectar nueva cuenta (acepta email+password o session_cookie)
  if (req.method === 'POST') {
    const { linkedin_email, linkedin_password, session_cookie, profile_name } = req.body || {};

    // Modo credenciales: intentar login directo
    if (linkedin_email && linkedin_password) {
      // En Vercel no podemos usar Playwright, hacemos login HTTP
      let obtainedCookie = null;

      try {
        // Paso 1: Obtener CSRF token
        const loginPageRes = await fetch('https://www.linkedin.com/login', {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml',
          },
        });

        const loginPageCookies = loginPageRes.headers.get('set-cookie') || '';
        const jsessionMatch = loginPageCookies.match(/JSESSIONID="?([^;"\s]+)/);
        const jsessionId = jsessionMatch ? jsessionMatch[1] : '';

        const loginPageHtml = await loginPageRes.text();
        const csrfMatch = loginPageHtml.match(/loginCsrfParam.*?value="([^"]+)"/);
        const csrfToken = csrfMatch ? csrfMatch[1] : '';

        // Paso 2: Enviar credenciales
        const loginRes = await fetch('https://www.linkedin.com/checkpoint/lg/login-submit', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Cookie': `JSESSIONID="${jsessionId}"`,
            'Csrf-Token': jsessionId,
          },
          body: new URLSearchParams({
            session_key: linkedin_email,
            session_password: linkedin_password,
            loginCsrfParam: csrfToken,
          }).toString(),
          redirect: 'manual',
        });

        const loginCookies = loginRes.headers.get('set-cookie') || '';
        const liAtMatch = loginCookies.match(/li_at=([^;]+)/);
        if (liAtMatch) {
          obtainedCookie = liAtMatch[1];
        }
      } catch (e) {
        console.error('[LINKEDIN] Login HTTP error:', e.message);
      }

      if (!obtainedCookie) {
        return res.status(401).json({
          error: 'No se pudo autenticar con LinkedIn. LinkedIn requiere verificación adicional. Por favor ingresa la cookie li_at manualmente (Instrucciones abajo).',
          needsCookie: true,
        });
      }

      // Guardar cuenta
      const { data: account, error: insertError } = await supabaseAdmin
        .from('linkedin_accounts')
        .insert({
          user_id: userId,
          session_cookie: obtainedCookie,
          profile_name: linkedin_email.split('@')[0] || 'Mi Cuenta LinkedIn',
          is_valid: true,
          last_validated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (insertError) return res.status(400).json({ error: insertError.message });
      return res.status(200).json({
        success: true,
        account,
        message: '✓ Cuenta LinkedIn conectada exitosamente',
      });
    }

    // Modo cookie manual
    if (session_cookie) {
      // Validar cookie rápidamente
      let isValid = false;
      let profileName = profile_name || 'Mi Cuenta LinkedIn';
      try {
        const validateRes = await fetch('https://www.linkedin.com/voyager/api/me', {
          headers: {
            'cookie': `li_at=${session_cookie}`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'csrf-token': 'ajax:0',
          },
        });
        if (validateRes.status === 200) {
          isValid = true;
          try {
            const data = await validateRes.json();
            profileName = `${data.firstName || ''} ${data.lastName || ''}`.trim() || profileName;
          } catch { /* ignorar */ }
        }
      } catch (e) {
        isValid = true; // Si no podemos validar, la guardamos de todos modos
      }

      if (!isValid && session_cookie.length < 10) {
        return res.status(401).json({ error: 'Cookie li_at inválida o muy corta' });
      }

      const { data: account, error: insertError } = await supabaseAdmin
        .from('linkedin_accounts')
        .insert({
          user_id: userId,
          session_cookie,
          profile_name: profileName,
          is_valid: true,
          last_validated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (insertError) return res.status(400).json({ error: insertError.message });
      return res.status(200).json({ success: true, account, message: '✓ Cuenta conectada' });
    }

    return res.status(400).json({ error: 'Se requiere linkedin_email+linkedin_password o session_cookie' });
  }

  return res.status(405).json({ error: 'Método no permitido' });
}
