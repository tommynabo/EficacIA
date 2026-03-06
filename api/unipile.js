import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// Variables de entorno necesarias:
// UNIPILE_DSN              → Tu DSN de Unipile (ej: "api1.unipile.com:13443")
// UNIPILE_API_KEY          → Tu API Key de Unipile (desde el dashboard)
// UNIPILE_WEBHOOK_SECRET   → (Opcional) Secreto para verificar firma de webhooks
// SUPABASE_URL             → URL de tu proyecto Supabase
// SUPABASE_SERVICE_ROLE_KEY → Clave de servicio de Supabase
// JWT_SECRET               → Secreto para verificar tokens JWT

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

// ─── Utilidades compartidas ────────────────────────────────────────

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

  if (error) { console.error('[UNIPILE][TEAM]', error.message); return null; }
  return newTeam?.id || null;
}

function verifyWebhookSignature(req) {
  const secret = process.env.UNIPILE_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('[WEBHOOK] UNIPILE_WEBHOOK_SECRET no configurado. Webhook sin verificar.');
    return true;
  }
  const signature = req.headers['x-webhook-signature'] || req.headers['x-unipile-signature'];
  if (!signature) return false;

  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// ─── Handler: genera link O procesa webhook según ?action= ─────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const action = req.query.action;

  // ─── WEBHOOK: POST /api/unipile?action=webhook ───────────────────
  if (action === 'webhook') {
    return handleWebhook(req, res);
  }

  // ─── GENERATE LINK: POST /api/unipile  (default) ────────────────
  return handleGenerateLink(req, res);
}

// ─── Generar Hosted Auth Link de Unipile ───────────────────────────

async function handleGenerateLink(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'No autenticado. Inicia sesión primero.' });
    }

    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, email')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    const unipileDsn = process.env.UNIPILE_DSN;
    const unipileApiKey = process.env.UNIPILE_API_KEY;

    if (!unipileDsn || !unipileApiKey) {
      console.error('[UNIPILE] Faltan variables de entorno UNIPILE_DSN o UNIPILE_API_KEY');
      return res.status(500).json({ error: 'Error de configuración del servidor. Contacta al administrador.' });
    }

    const unipileUrl = `https://${unipileDsn}/api/v1/hosted/accounts/link`;
    const expiresOn = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const successRedirectUrl = (process.env.FRONTEND_URL || 'http://localhost:5173') 
      + '/dashboard/accounts?unipile=success';

    const webhookUrl = (process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : process.env.FRONTEND_URL || 'http://localhost:3001')
      + '/api/unipile?action=webhook';

    const response = await fetch(unipileUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-API-KEY': unipileApiKey,
        'Authorization': `Bearer ${unipileApiKey}`,
      },
      body: JSON.stringify({
        type: 'create',
        providers: ['LINKEDIN'],
        externalId: userId,
        notify_url: successRedirectUrl,
        name: user.email,
        expiresOn: expiresOn,
        api_url: webhookUrl,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('[UNIPILE] Error al generar link:', response.status, errorBody);
      return res.status(502).json({ error: 'No se pudo generar el enlace de conexión. Inténtalo de nuevo.' });
    }

    const data = await response.json();

    if (!data.url) {
      console.error('[UNIPILE] Respuesta sin URL:', JSON.stringify(data));
      return res.status(502).json({ error: 'Respuesta inesperada de Unipile. Inténtalo de nuevo.' });
    }

    console.log(`[UNIPILE] Link generado para usuario ${userId}`);
    return res.status(200).json({ url: data.url, message: 'Enlace de conexión generado correctamente.' });

  } catch (err) {
    console.error('[UNIPILE] Error interno:', err);
    return res.status(500).json({ error: 'Error interno del servidor. Inténtalo más tarde.' });
  }
}

// ─── Webhook: Unipile notifica conexión completada ─────────────────

async function handleWebhook(req, res) {
  try {
    if (!verifyWebhookSignature(req)) {
      console.error('[WEBHOOK] Firma inválida. Posible ataque.');
      return res.status(401).json({ error: 'Firma de webhook inválida.' });
    }

    const payload = req.body;
    console.log('[WEBHOOK] Evento recibido de Unipile:', JSON.stringify(payload, null, 2));

    const event = payload.event || payload.type;
    const data = payload.data || payload;

    const eventosConexion = ['account.created', 'account.connected', 'account_connected'];
    if (!eventosConexion.includes(event)) {
      console.log(`[WEBHOOK] Evento "${event}" ignorado (no es de conexión).`);
      return res.status(200).json({ received: true, processed: false });
    }

    const unipileAccountId = data.account_id || data.accountId || data.id;
    const externalId = data.external_id || data.externalId;
    const provider = data.provider || 'LINKEDIN';
    const accountName = data.name || data.account_name || null;

    if (!unipileAccountId) {
      console.error('[WEBHOOK] account_id no encontrado:', JSON.stringify(data));
      return res.status(400).json({ error: 'Falta account_id en el payload.' });
    }

    if (!externalId) {
      console.error('[WEBHOOK] external_id (user_id) no encontrado:', JSON.stringify(data));
      return res.status(400).json({ error: 'Falta external_id (user_id) en el payload.' });
    }

    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', externalId)
      .single();

    if (userError || !user) {
      console.error(`[WEBHOOK] Usuario ${externalId} no encontrado.`);
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    const teamId = await getOrCreateTeam(externalId);
    if (!teamId) {
      console.error(`[WEBHOOK] No se pudo obtener/crear equipo para ${externalId}`);
      return res.status(500).json({ error: 'Error al obtener equipo del usuario.' });
    }

    // Buscar si ya existe (evitar duplicados)
    const { data: existingAccount } = await supabaseAdmin
      .from('linkedin_accounts')
      .select('id')
      .eq('unipile_account_id', unipileAccountId)
      .single();

    if (existingAccount) {
      const { error: updateError } = await supabaseAdmin
        .from('linkedin_accounts')
        .update({
          status: 'active',
          is_valid: true,
          profile_name: accountName || undefined,
          last_validated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingAccount.id);

      if (updateError) {
        console.error('[WEBHOOK] Error al actualizar cuenta:', updateError.message);
        return res.status(500).json({ error: 'Error al actualizar la cuenta.' });
      }

      console.log(`[WEBHOOK] Cuenta reconectada: ${unipileAccountId} → usuario ${externalId}`);
      return res.status(200).json({ received: true, action: 'updated' });
    }

    // Crear nueva cuenta
    const username = (accountName || 'linkedin').toLowerCase().replace(/\s+/g, '-');
    const { data: newAccount, error: insertError } = await supabaseAdmin
      .from('linkedin_accounts')
      .insert({
        team_id: teamId,
        username: username,
        unipile_account_id: unipileAccountId,
        profile_name: accountName || `LinkedIn (${provider})`,
        connection_method: 'unipile',
        status: 'active',
        is_valid: true,
        session_cookie: 'managed_by_unipile',
        last_validated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error('[WEBHOOK] Error al insertar cuenta:', insertError.message);
      return res.status(500).json({ error: 'Error al guardar la cuenta de LinkedIn.' });
    }

    console.log(`[WEBHOOK] ✓ Cuenta creada: ${newAccount.id} (Unipile: ${unipileAccountId}) → usuario ${externalId}`);
    return res.status(200).json({ received: true, action: 'created', accountId: newAccount.id });

  } catch (err) {
    console.error('[WEBHOOK] Error interno:', err);
    return res.status(200).json({ received: true, error: 'Error interno procesado.' });
  }
}
