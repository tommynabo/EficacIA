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
    // No secret configured — allow all webhooks through
    console.log('[WEBHOOK] No UNIPILE_WEBHOOK_SECRET set — skipping signature verification.');
    return true;
  }
  const signature = req.headers['x-webhook-signature']
    || req.headers['x-unipile-signature']
    || req.headers['x-hub-signature-256'];

  if (!signature) {
    // Some Unipile webhook types don't include a signature header — allow through with warning
    console.warn('[WEBHOOK] Secret configured but no signature header present. Allowing through for debugging. Received headers:', JSON.stringify(Object.keys(req.headers)));
    return true;
  }

  // Verify HMAC
  try {
    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const expectedSignature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const sig = signature.replace(/^sha256=/, '');
    const sigBuf = Buffer.from(sig, 'hex');
    const expBuf = Buffer.from(expectedSignature, 'hex');
    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  } catch (e) {
    console.error('[WEBHOOK] Signature verification error:', e.message);
    return false;
  }
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

  // ─── SYNC: POST /api/unipile?action=sync ─────────────────────────
  // Sincroniza cuentas de Unipile con nuestra DB (llamado desde frontend)
  if (action === 'sync') {
    return handleSync(req, res);
  }

  // ─── REGISTER: POST /api/unipile?action=register&accountId=XXX ──
  // Llamado desde el frontend cuando el usuario vuelve del auth de Unipile
  if (action === 'register') {
    return handleRegister(req, res);
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

    const unipileDsn = (process.env.UNIPILE_DSN || '').trim();
    const unipileApiKey = (process.env.UNIPILE_API_KEY || '').trim();

    if (!unipileDsn || !unipileApiKey) {
      console.error('[UNIPILE] Faltan variables de entorno UNIPILE_DSN o UNIPILE_API_KEY');
      return res.status(500).json({ error: 'Error de configuración del servidor. Contacta al administrador.' });
    }

    const unipileUrl = `https://${unipileDsn}/api/v1/hosted/accounts/link`;

    // expiresOn: formato estricto YYYY-MM-DDTHH:MM:SS.sssZ (30 min desde ahora)
    const expires = new Date(Date.now() + 30 * 60 * 1000);
    const expiresOn = expires.toISOString().replace(/(\.\d{3})\d*Z$/, '$1Z');

    // Derivar URL base del host actual (funciona en Vercel y local)
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host; // ej: eficac-ia.vercel.app
    const baseUrl = `${protocol}://${host}`;

    const successRedirectUrl = baseUrl + '/dashboard/accounts?unipile=success';

    // notify_url: donde Unipile nos avisa cuando el usuario completa el login
    // Incluimos userId en la query porque Unipile sobreescribe el campo 'name'
    const webhookUrl = baseUrl + `/api/unipile?action=webhook&userId=${userId}`;

    // api_url: URL del servidor Unipile (NO nuestro webhook)
    const unipileServerUrl = `https://${unipileDsn}`;

    const response = await fetch(unipileUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-API-KEY': unipileApiKey,
      },
      body: JSON.stringify({
        type: 'create',
        providers: ['LINKEDIN'],
        api_url: unipileServerUrl,
        expiresOn: expiresOn,
        name: `${userId}`,
        success_redirect_url: successRedirectUrl,
        notify_url: webhookUrl,
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

    console.log(`[UNIPILE] Link generado para usuario ${userId} | redirect=${successRedirectUrl} | webhook=${webhookUrl}`);
    return res.status(200).json({ url: data.url, message: 'Enlace de conexión generado correctamente.' });

  } catch (err) {
    console.error('[UNIPILE] Error interno:', err);
    return res.status(500).json({ error: 'Error interno del servidor. Inténtalo más tarde.' });
  }
}

// ─── Sync: sincroniza cuentas de Unipile con nuestra DB ────────────

async function handleSync(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'No autenticado.' });
    }

    const unipileDsn = (process.env.UNIPILE_DSN || '').trim();
    const unipileApiKey = (process.env.UNIPILE_API_KEY || '').trim();

    if (!unipileDsn || !unipileApiKey) {
      return res.status(500).json({ error: 'Configuración de Unipile incompleta.' });
    }

    // Listar todas las cuentas de Unipile
    const listRes = await fetch(`https://${unipileDsn}/api/v1/accounts`, {
      headers: { 'X-API-KEY': unipileApiKey, 'Accept': 'application/json' },
    });

    if (!listRes.ok) {
      console.error('[SYNC] Error listando cuentas Unipile:', listRes.status);
      return res.status(502).json({ error: 'Error al consultar Unipile.' });
    }

    const listData = await listRes.json();
    const accounts = listData.items || listData || [];
    console.log(`[SYNC] Unipile devolvió ${Array.isArray(accounts) ? accounts.length : 0} cuentas`);

    if (!Array.isArray(accounts) || accounts.length === 0) {
      return res.status(200).json({ synced: 0, message: 'No hay cuentas en Unipile.' });
    }

    const teamId = await getOrCreateTeam(userId);
    if (!teamId) {
      return res.status(500).json({ error: 'Error al obtener equipo del usuario.' });
    }

    // Obtener cuentas ya registradas
    const { data: existingAccounts } = await supabaseAdmin
      .from('linkedin_accounts')
      .select('unipile_account_id')
      .eq('team_id', teamId);

    const existingIds = new Set((existingAccounts || []).map(a => a.unipile_account_id));

    let synced = 0;
    for (const account of accounts) {
      const accountId = account.id;
      if (!accountId || existingIds.has(accountId)) continue;

      // Solo cuentas LinkedIn activas
      const accountType = account.type || '';
      const sources = account.sources || [];
      const isActive = sources.some(s => s.status === 'OK');
      if (!isActive) continue;

      const profileName = account.connection_params?.im?.username
        || account.name
        || `LinkedIn (${accountType})`;
      const username = profileName.toLowerCase().replace(/\s+/g, '-');

      const { error: insertError } = await supabaseAdmin
        .from('linkedin_accounts')
        .insert({
          team_id: teamId,
          username: username,
          unipile_account_id: accountId,
          profile_name: profileName,
          connection_method: 'unipile',
          is_valid: true,
          session_cookie: 'managed_by_unipile',
          last_validated_at: new Date().toISOString(),
        });

      if (insertError) {
        console.error(`[SYNC] Error insertando ${accountId}:`, insertError.message);
      } else {
        synced++;
        console.log(`[SYNC] ✓ Cuenta registrada: ${accountId} (${profileName}) → usuario ${userId}`);
      }
    }

    return res.status(200).json({ synced, message: `${synced} cuenta(s) sincronizada(s).` });

  } catch (err) {
    console.error('[SYNC] Error interno:', err);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
}

// ─── Register: el frontend registra la cuenta tras completar auth ──

async function handleRegister(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'No autenticado.' });
    }

    const unipileAccountId = req.query.accountId;
    if (!unipileAccountId) {
      return res.status(400).json({ error: 'Falta accountId en la petición.' });
    }

    const unipileDsn = (process.env.UNIPILE_DSN || '').trim();
    const unipileApiKey = (process.env.UNIPILE_API_KEY || '').trim();

    // Obtener detalles de la cuenta desde Unipile
    let profileName = null;
    let provider = 'LINKEDIN';

    if (unipileDsn && unipileApiKey) {
      try {
        const accountRes = await fetch(`https://${unipileDsn}/api/v1/accounts/${unipileAccountId}`, {
          headers: { 'X-API-KEY': unipileApiKey, 'Accept': 'application/json' },
        });
        if (accountRes.ok) {
          const accountData = await accountRes.json();
          console.log('[REGISTER] Datos de cuenta Unipile:', JSON.stringify(accountData, null, 2));
          profileName = accountData.connection_params?.im?.username
            || accountData.name
            || null;
          provider = accountData.type || 'LINKEDIN';
        } else {
          console.error('[REGISTER] Error obteniendo cuenta de Unipile:', accountRes.status);
        }
      } catch (fetchErr) {
        console.error('[REGISTER] Error al consultar API Unipile:', fetchErr.message);
      }
    }

    const teamId = await getOrCreateTeam(userId);
    if (!teamId) {
      return res.status(500).json({ error: 'Error al obtener equipo del usuario.' });
    }

    // Verificar si ya existe
    const { data: existingAccount } = await supabaseAdmin
      .from('linkedin_accounts')
      .select('id')
      .eq('unipile_account_id', unipileAccountId)
      .single();

    if (existingAccount) {
      await supabaseAdmin
        .from('linkedin_accounts')
        .update({
          is_valid: true,
          profile_name: profileName || undefined,
          last_validated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingAccount.id);

      console.log(`[REGISTER] ✓ Cuenta reconectada: ${unipileAccountId} → usuario ${userId}`);
      return res.status(200).json({ success: true, action: 'updated' });
    }

    // Crear nueva cuenta
    // ── Verificar límites del plan antes de crear cuenta nueva ───────────────
    const ACCOUNT_LIMITS = { free: 1, pro: 3, growth: 5, scale: Infinity };
    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('subscription_status')
      .eq('id', userId)
      .single();
    const userPlan = userRow?.subscription_status || 'free';
    const planLimit = ACCOUNT_LIMITS[userPlan] ?? 1;
    if (planLimit !== Infinity) {
      const { count: accountCount } = await supabaseAdmin
        .from('linkedin_accounts')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', teamId);
      if ((accountCount || 0) >= planLimit) {
        console.warn(`[REGISTER] Plan limit reached for user ${userId} (plan: ${userPlan}, limit: ${planLimit})`);
        return res.status(403).json({ error: 'PLAN_LIMIT_REACHED', limit: planLimit, plan: userPlan });
      }
    }

    const username = (profileName || 'linkedin').toLowerCase().replace(/\s+/g, '-');
    const { data: newAccount, error: insertError } = await supabaseAdmin
      .from('linkedin_accounts')
      .insert({
        team_id: teamId,
        username: username,
        unipile_account_id: unipileAccountId,
        profile_name: profileName || `LinkedIn (${provider})`,
        connection_method: 'unipile',
        is_valid: true,
        session_cookie: 'managed_by_unipile',
        last_validated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error('[REGISTER] Error al insertar cuenta:', insertError.message);
      return res.status(500).json({ error: 'Error al guardar la cuenta de LinkedIn.' });
    }

    console.log(`[REGISTER] ✓ Cuenta creada: ${newAccount.id} (Unipile: ${unipileAccountId}) → usuario ${userId}`);
    return res.status(200).json({ success: true, action: 'created', accountId: newAccount.id });

  } catch (err) {
    console.error('[REGISTER] Error interno:', err);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
}

// ─── Webhook: Unipile notifica conexión completada (backup) ────────

async function handleWebhook(req, res) {
  try {
    if (!verifyWebhookSignature(req)) {
      console.error('[WEBHOOK] Firma inválida. Posible ataque.');
      return res.status(401).json({ error: 'Firma de webhook inválida.' });
    }

    const payload = req.body;
    console.log('[WEBHOOK] Evento recibido de Unipile:', JSON.stringify(payload, null, 2));

    // Unipile envía: { "AccountStatus": { "account_id": "...", "message": "OK", "account_type": "LINKEDIN" } }
    const accountStatus = payload.AccountStatus || payload.account_status;
    
    // También soportar formato alternativo con event/data
    const event = payload.event || payload.type;
    const eventData = payload.data || payload;

    let unipileAccountId;
    let provider;

    if (accountStatus) {
      // Formato real de Unipile
      if (accountStatus.message !== 'OK') {
        console.log(`[WEBHOOK] AccountStatus con message="${accountStatus.message}", ignorado.`);
        return res.status(200).json({ received: true, processed: false });
      }
      unipileAccountId = accountStatus.account_id;
      provider = accountStatus.account_type || 'LINKEDIN';
    } else if (event) {
      // Formato alternativo documentado
      const eventosConexion = ['account.created', 'account.connected', 'account_connected'];
      if (!eventosConexion.includes(event)) {
        console.log(`[WEBHOOK] Evento "${event}" ignorado (no es de conexión).`);
        return res.status(200).json({ received: true, processed: false });
      }
      unipileAccountId = eventData.account_id || eventData.accountId || eventData.id;
      provider = eventData.provider || eventData.account_type || 'LINKEDIN';
    } else {
      console.log('[WEBHOOK] Formato de payload no reconocido, ignorado.');
      return res.status(200).json({ received: true, processed: false });
    }

    if (!unipileAccountId) {
      console.error('[WEBHOOK] account_id no encontrado:', JSON.stringify(payload));
      return res.status(400).json({ error: 'Falta account_id en el payload.' });
    }

    if (event === 'message.created' || event === 'chat.created') {
      try {
        const senderId = eventData.sender_id || eventData.attendees?.[0]?.provider_id;
        const isSender = eventData.is_sender;
        
        console.log(`[WEBHOOK] Nuevo mensaje/chat en cuenta ${unipileAccountId} de ${senderId}. is_sender: ${isSender}`);

        if (!isSender && senderId) {
          // It's the lead replying
          // 1. Get the account's team
          const { data: account } = await supabaseAdmin
            .from('linkedin_accounts')
            .select('id, team_id')
            .eq('unipile_account_id', unipileAccountId)
            .single();

          if (account) {
            // 2. Fetch sender profile to get public_identifier
            const unipileDsn = (process.env.UNIPILE_DSN || '').trim();
            const unipileApiKey = (process.env.UNIPILE_API_KEY || '').trim();
            
            let publicIdentifier = senderId;
            try {
              const userRes = await fetch(`https://${unipileDsn}/api/v1/users/${senderId}?account_id=${unipileAccountId}`, {
                headers: { 'X-API-KEY': unipileApiKey, 'Accept': 'application/json' },
              });
              if (userRes.ok) {
                const userData = await userRes.json();
                publicIdentifier = userData.public_identifier || userData.provider_id || senderId;
              }
            } catch (err) {
              console.error('[WEBHOOK] Error fetch sender profile:', err.message);
            }

            // 3. Find matching active leads
            const queryStr = `%${publicIdentifier}%`;
            const { data: leads } = await supabaseAdmin
              .from('leads')
              .select('id, campaign_id, sequence_status, linkedin_url')
              .ilike('linkedin_url', queryStr)
              .in('sequence_status', ['active', 'pending'])
              .limit(5);

            if (leads && leads.length > 0) {
              for (const lead of leads) {
                // If the vanity matches tightly (extra check)
                if (lead.linkedin_url.includes(publicIdentifier)) {
                  // Get campaign to see if stop_on_reply is enabled
                  const { data: campaign } = await supabaseAdmin
                    .from('campaigns')
                    .select('id, settings')
                    .eq('id', lead.campaign_id)
                    .single();

                  if (campaign?.settings?.stop_on_reply) {
                    console.log(`[WEBHOOK] Deteniendo secuencia para lead ${lead.id} en campaña ${campaign.id} por repuesta.`);
                    await supabaseAdmin
                      .from('leads')
                      .update({
                        sequence_status: 'replied',
                        status: 'replied',
                        last_action_at: new Date().toISOString()
                      })
                      .eq('id', lead.id);
                  }
                }
              }
            }
          }
        }
        return res.status(200).json({ received: true, message: 'Message webhook processed' });
      } catch (err) {
        console.error('[WEBHOOK] Error processing message:', err.message);
        return res.status(500).json({ error: 'Error processing message webhook' });
      }
    }

    // userId viene en la query del notify_url (lo incluimos al generar el link)
    // Unipile sobreescribe el campo 'name' con el nombre del perfil de LinkedIn
    let userId = req.query.userId || null;
    let profileName = null;

    // Consultar la API de Unipile para obtener el nombre del perfil
    const unipileDsn = (process.env.UNIPILE_DSN || '').trim();
    const unipileApiKey = (process.env.UNIPILE_API_KEY || '').trim();

    if (unipileDsn && unipileApiKey) {
      try {
        const accountRes = await fetch(`https://${unipileDsn}/api/v1/accounts/${unipileAccountId}`, {
          headers: { 'X-API-KEY': unipileApiKey, 'Accept': 'application/json' },
        });
        if (accountRes.ok) {
          const accountData = await accountRes.json();
          console.log('[WEBHOOK] Datos de cuenta Unipile:', JSON.stringify(accountData, null, 2));
          // Extraer nombre del perfil de LinkedIn
          profileName = accountData.connection_params?.im?.username
            || accountData.name
            || null;
        } else {
          console.error('[WEBHOOK] Error obteniendo cuenta de Unipile:', accountRes.status);
        }
      } catch (fetchErr) {
        console.error('[WEBHOOK] Error al consultar API Unipile:', fetchErr.message);
      }
    }

    if (!userId) {
      console.error('[WEBHOOK] No se pudo determinar el user_id para account:', unipileAccountId);
      return res.status(400).json({ error: 'No se pudo vincular la cuenta al usuario.' });
    }

    // Verificar que el usuario existe
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      console.error(`[WEBHOOK] Usuario ${userId} no encontrado.`);
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    const teamId = await getOrCreateTeam(userId);
    if (!teamId) {
      console.error(`[WEBHOOK] No se pudo obtener/crear equipo para ${userId}`);
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
          is_valid: true,
          profile_name: profileName || undefined,
          last_validated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingAccount.id);

      if (updateError) {
        console.error('[WEBHOOK] Error al actualizar cuenta:', updateError.message);
        return res.status(500).json({ error: 'Error al actualizar la cuenta.' });
      }

      console.log(`[WEBHOOK] ✓ Cuenta reconectada: ${unipileAccountId} → usuario ${userId}`);
      return res.status(200).json({ received: true, action: 'updated' });
    }

    // Crear nueva cuenta
    const username = (profileName || 'linkedin').toLowerCase().replace(/\s+/g, '-');
    const { data: newAccount, error: insertError } = await supabaseAdmin
      .from('linkedin_accounts')
      .insert({
        team_id: teamId,
        username: username,
        unipile_account_id: unipileAccountId,
        profile_name: profileName || `LinkedIn (${provider})`,
        connection_method: 'unipile',
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

    console.log(`[WEBHOOK] ✓ Cuenta creada: ${newAccount.id} (Unipile: ${unipileAccountId}) → usuario ${userId}`);
    return res.status(200).json({ received: true, action: 'created', accountId: newAccount.id });

  } catch (err) {
    console.error('[WEBHOOK] Error interno:', err);
    return res.status(200).json({ received: true, error: 'Error interno procesado.' });
  }
}
