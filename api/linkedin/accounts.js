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
    .from('teams')
    .select('id')
    .eq('owner_id', userId)
    .limit(1);

  if (teams && teams.length > 0) return teams[0].id;

  const { data: newTeam, error } = await supabaseAdmin
    .from('teams')
    .insert({ owner_id: userId, name: 'Mi Equipo' })
    .select()
    .single();

  if (error) { console.error('[TEAM]', error.message); return null; }
  return newTeam?.id || null;
}

/**
 * Inicia sesión en LinkedIn usando Browserless.io (cloud headless Chrome).
 * Requiere BROWSERLESS_TOKEN en las variables de entorno.
 * Registro gratuito en https://www.browserless.io
 */
async function loginWithBrowserless(email, password) {
  const token = process.env.BROWSERLESS_TOKEN;
  if (!token || token.trim() === '') {
    console.warn('[BROWSERLESS] BROWSERLESS_TOKEN no configurado');
    return { tokenMissing: true };
  }

  console.log('[BROWSERLESS] Token presente, longitud:', token.length);

  // Código Puppeteer en formato ESM (Browserless actual requiere export default)
  const puppeteerCode = `
    export default async ({ page, context }) => {
      const { email, password } = context;
      try {
        await page.goto('https://www.linkedin.com/login', {
          waitUntil: 'networkidle2',
          timeout: 30000,
        });

        await page.waitForSelector('#username', { timeout: 10000 });
        await page.type('#username', email, { delay: 60 });
        await page.waitForSelector('#password', { timeout: 5000 });
        await page.type('#password', password, { delay: 60 });

        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 25000 }),
          page.click('[type=submit]'),
        ]);

        const currentUrl = page.url();

        if (
          currentUrl.includes('/checkpoint/') ||
          currentUrl.includes('/challenge/') ||
          currentUrl.includes('verification') ||
          currentUrl.includes('/authwall')
        ) {
          return { error: 'LinkedIn requiere verificación adicional (2FA o email de confirmación). Por favor activa la cuenta en LinkedIn y vuelve a intentarlo.', needsVerification: true };
        }

        if (currentUrl.includes('/login') || currentUrl.includes('/uas/login')) {
          const errorEl = await page.$('.form__input--error, .alert-content, [role=alert]');
          const errorText = errorEl ? await page.evaluate(el => el.textContent.trim(), errorEl) : '';
          return { error: errorText || 'Email o contraseña incorrectos.', invalidCredentials: true };
        }

        const cookies = await page.cookies('https://www.linkedin.com');
        const liAt = cookies.find(c => c.name === 'li_at');

        if (!liAt?.value) {
          return { error: 'No se pudo obtener la sesión de LinkedIn. Intenta de nuevo.' };
        }

        let profileName = email.split('@')[0];
        try {
          await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 10000 });
          const nameEl = await page.$('h1.text-heading-xlarge, h1.inline, h1');
          if (nameEl) {
            profileName = await page.evaluate(el => el.textContent.trim(), nameEl);
          }
        } catch { /* ignorar */ }

        return { liAt: liAt.value, profileName };
      } catch (err) {
        return { error: 'Error durante la autenticación: ' + err.message };
      }
    };
  `;

  // Timeout manual (AbortSignal.timeout no disponible en todos los entornos)
  const timeoutMs = 65000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Probar primero Browserless v1
    const browserlessUrl = `https://chrome.browserless.io/function?token=${token}`;
    console.log('[BROWSERLESS] Llamando a:', browserlessUrl.replace(token, '[TOKEN]'));

    const response = await fetch(browserlessUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: puppeteerCode,
        context: { email, password },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[BROWSERLESS] Error HTTP:', response.status, errorText.slice(0, 500));
      return {
        browserlessError: true,
        status: response.status,
        message: errorText.slice(0, 300),
      };
    }

    const result = await response.json();
    console.log('[BROWSERLESS] Resultado:', JSON.stringify({
      ...result,
      liAt: result.liAt ? '[OBTENIDO]' : undefined,
    }));
    return result;

  } catch (err) {
    clearTimeout(timeoutId);
    const isTimeout = err.name === 'AbortError';
    console.error('[BROWSERLESS] Error:', isTimeout ? 'Timeout' : err.message);
    return {
      browserlessError: true,
      message: isTimeout
        ? 'Timeout: El navegador tardó demasiado. Intenta de nuevo.'
        : `Error de conexión con Browserless: ${err.message}`,
    };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });

  // GET - listar cuentas LinkedIn del usuario
  if (req.method === 'GET') {
    const teamId = await getOrCreateTeam(userId);
    if (!teamId) return res.status(200).json({ success: true, accounts: [] });

    const { data: accounts, error } = await supabaseAdmin
      .from('linkedin_accounts')
      .select('id, team_id, username, profile_name, is_valid, created_at, last_validated_at')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ success: true, accounts: accounts || [] });
  }

  // POST - conectar nueva cuenta con email + contraseña (headless browser)
  if (req.method === 'POST') {
    const { linkedin_email, linkedin_password } = req.body || {};

    if (!linkedin_email || !linkedin_password) {
      return res.status(400).json({ error: 'Email y contraseña de LinkedIn requeridos' });
    }

    // Usar Browserless.io para login con navegador real en la nube
    const browserResult = await loginWithBrowserless(linkedin_email, linkedin_password);

    // Token no configurado
    if (browserResult.tokenMissing) {
      return res.status(503).json({
        error: 'BROWSERLESS_TOKEN no está configurado en las variables de entorno de Vercel. Ve a Vercel → Settings → Environment Variables y añade BROWSERLESS_TOKEN.',
      });
    }

    // Error del servicio Browserless
    if (browserResult.browserlessError) {
      return res.status(503).json({
        error: `Error del servicio de automatización: ${browserResult.message || 'Error desconocido'}. Estado HTTP: ${browserResult.status || 'N/A'}`,
      });
    }

    // LinkedIn devolvió un error (2FA, credenciales, etc.)
    if (browserResult.error) {
      const statusCode = browserResult.invalidCredentials ? 401 : 422;
      return res.status(statusCode).json({ error: browserResult.error, ...browserResult });
    }

    if (!browserResult.liAt) {
      return res.status(401).json({ error: 'No se pudo obtener la sesión de LinkedIn. Intenta de nuevo.' });
    }

    // Guardar cuenta en Supabase
    const teamId = await getOrCreateTeam(userId);
    if (!teamId) return res.status(500).json({ error: 'No se pudo obtener el equipo' });

    const usernameSlug = linkedin_email.split('@')[0] || 'linkedin';
    const profileName = browserResult.profileName || usernameSlug;

    const { data: account, error: insertError } = await supabaseAdmin
      .from('linkedin_accounts')
      .insert({
        team_id: teamId,
        username: usernameSlug,
        profile_name: profileName,
        session_cookie: browserResult.liAt,
        is_valid: true,
        last_validated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) return res.status(400).json({ error: insertError.message });

    return res.status(200).json({
      success: true,
      account,
      message: `✓ Cuenta de ${profileName} conectada exitosamente`,
    });
  }

  return res.status(405).json({ error: 'Método no permitido' });
}
