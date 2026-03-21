import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

function unipileHeaders() {
  return {
    'X-API-KEY': (process.env.UNIPILE_API_KEY || '').trim(),
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };
}

function unipileBase() {
  return `https://${(process.env.UNIPILE_DSN || '').trim()}`;
}

/**
 * Parse Unipile's human-readable "date" field (e.g. "Sent today", "Sent 3 days ago", "Sent a week ago")
 * into an approximate Date object. Unipile generates parsed_datetime dynamically as "now", so this
 * is the only reliable way to determine when the invitation was actually sent.
 */
function parseSentDate(dateStr) {
  if (!dateStr) return null;
  const s = dateStr.toLowerCase().trim();
  const now = new Date();

  if (s.includes('today') || s.includes('hoy')) {
    const d = new Date(now); d.setHours(0, 0, 0, 0); return d;
  }
  if (s.includes('yesterday') || s.includes('ayer')) {
    const d = new Date(now); d.setDate(d.getDate() - 1); d.setHours(0, 0, 0, 0); return d;
  }
  const daysMatch = s.match(/(\d+)\s+day/);
  if (daysMatch) {
    const d = new Date(now); d.setDate(d.getDate() - parseInt(daysMatch[1])); d.setHours(0, 0, 0, 0); return d;
  }
  if (s.includes('a week') || s.match(/^sent\s+1\s+week/)) {
    const d = new Date(now); d.setDate(d.getDate() - 7); d.setHours(0, 0, 0, 0); return d;
  }
  const weeksMatch = s.match(/(\d+)\s+week/);
  if (weeksMatch) {
    const d = new Date(now); d.setDate(d.getDate() - parseInt(weeksMatch[1]) * 7); d.setHours(0, 0, 0, 0); return d;
  }
  if (s.includes('a month') || s.match(/^sent\s+1\s+month/)) {
    const d = new Date(now); d.setDate(d.getDate() - 30); d.setHours(0, 0, 0, 0); return d;
  }
  const monthsMatch = s.match(/(\d+)\s+month/);
  if (monthsMatch) {
    const d = new Date(now); d.setDate(d.getDate() - parseInt(monthsMatch[1]) * 30); d.setHours(0, 0, 0, 0); return d;
  }
  // Try ISO / JS date parse as last resort
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? null : parsed;
}

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
 * Valida una cookie li_at llamando a la Voyager API de LinkedIn.
 * Si es válida, devuelve el nombre del perfil.
 * Esta es la técnica real que usan tools como Walead/Dux-Soup/Expandi.
 */
async function validateLiAtCookie(liAt) {
  console.log('[LINKEDIN] Validando cookie li_at...');

  try {
    // LinkedIn Voyager API - el par JSESSIONID="ajax:0" + csrf-token: ajax:0 funciona sin login real
    const response = await fetch('https://www.linkedin.com/voyager/api/me', {
      headers: {
        'Cookie': `li_at=${liAt}; JSESSIONID="ajax:0"`,
        'csrf-token': 'ajax:0',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'x-li-lang': 'en_US',
        'x-restli-protocol-version': '2.0.0',
        'Accept': 'application/vnd.linkedin.normalized+json+2.1',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Referer': 'https://www.linkedin.com/feed/',
      },
    });

    console.log('[LINKEDIN] Voyager API status:', response.status);

    if (response.status === 401 || response.status === 403) {
      return { valid: false, error: 'La cookie li_at no es válida o ha caducado. Vuelve a copiarla desde LinkedIn.' };
    }

    if (response.status === 429) {
      return { valid: false, error: 'LinkedIn está limitando las peticiones. Espera un momento e inténtalo de nuevo.' };
    }

    if (!response.ok) {
      // Fallback: comprobar acceso a /feed/
      console.log('[LINKEDIN] Voyager falló, usando fallback de /feed/...');
      return await validateWithFeedCheck(liAt);
    }

    const data = await response.json();

    // Extraer nombre del perfil
    let profileName = 'Usuario LinkedIn';
    let publicId = '';

    try {
      const included = data?.included || [];
      const miniProfile = included.find(item =>
        item?.firstName || item?.$type?.includes('MiniProfile')
      );

      if (miniProfile?.firstName || miniProfile?.lastName) {
        profileName = `${miniProfile.firstName || ''} ${miniProfile.lastName || ''}`.trim();
        publicId = miniProfile.publicIdentifier || '';
      } else if (data?.miniProfile?.firstName) {
        profileName = `${data.miniProfile.firstName || ''} ${data.miniProfile.lastName || ''}`.trim();
        publicId = data.miniProfile.publicIdentifier || '';
      }
    } catch (parseErr) {
      console.warn('[LINKEDIN] Error parseando nombre:', parseErr.message);
    }

    console.log('[LINKEDIN] Cookie válida. Perfil:', profileName);
    return { valid: true, profileName, publicId };

  } catch (err) {
    console.error('[LINKEDIN] Error validando:', err.message);
    return { valid: false, error: `Error de conexión con LinkedIn: ${err.message}` };
  }
}

/**
 * Fallback: validar cookie comprobando si /feed/ está accesible (sin redirección a /login)
 */
async function validateWithFeedCheck(liAt) {
  try {
    const response = await fetch('https://www.linkedin.com/feed/', {
      method: 'GET',
      headers: {
        'Cookie': `li_at=${liAt}`,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
      redirect: 'manual',
    });

    console.log('[LINKEDIN] Feed check status:', response.status, 'Location:', response.headers.get('location') || 'none');

    const location = response.headers.get('location') || '';
    if (location.includes('/login') || location.includes('/authwall') || response.status === 302) {
      return { valid: false, error: 'La cookie li_at no es válida o ha caducado. Cópiala de nuevo desde LinkedIn.' };
    }

    if (response.status === 200) {
      return { valid: true, profileName: 'Usuario LinkedIn', publicId: '' };
    }

    return { valid: false, error: `Respuesta inesperada de LinkedIn: ${response.status}` };
  } catch (err) {
    return { valid: false, error: `Error verificando sesión: ${err.message}` };
  }
}

/**
 * Registra una cuenta en Unipile usando la cookie li_at.
 * Esto permite que las cuentas conectadas por cookie funcionen con el motor de campañas.
 */
async function registerUnipileAccount(liAt) {
  const dsn = (process.env.UNIPILE_DSN || '').trim();
  const apiKey = (process.env.UNIPILE_API_KEY || '').trim();

  if (!dsn || !apiKey) {
    console.error('[UNIPILE] Falta configuración (DSN/API_KEY)');
    return { success: false, error: 'Configuración de Unipile incompleta en el servidor' };
  }

  try {
    console.log('[UNIPILE] Intentando registro directo con cookie...');
    const response = await fetch(`https://${dsn}/api/v1/accounts`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey,
      },
      body: JSON.stringify({
        type: 'LINKEDIN',
        connection_params: {
          linkedin_cookie: liAt // Formato estándar de Unipile para conexión directa por cookie
        }
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[UNIPILE] Error en registro:', response.status, data);
      return { 
        success: false, 
        error: data.message || `Error status ${response.status}` 
      };
    }

    console.log('[UNIPILE] Registro exitoso. Account ID:', data.id);
    return { success: true, accountId: data.id };

  } catch (err) {
    console.error('[UNIPILE] Error de conexión:', err.message);
    return { success: false, error: err.message };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── WITHDRAW action (cron or manual) ───────────────────────────────
  if (req.query.action === 'withdraw') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const cronSecret = req.headers['x-cron-secret'];
    const isValidCron = cronSecret && cronSecret === process.env.CRON_SECRET;
    const userId = getUserId(req);
    if (!isValidCron && !userId) return res.status(401).json({ error: 'No autenticado' });

    const dsn = (process.env.UNIPILE_DSN || '').trim();
    const apiKey = (process.env.UNIPILE_API_KEY || '').trim();
    if (!dsn || !apiKey) return res.status(500).json({ error: 'Unipile no configurado' });

    try {
      const specificAccountId = req.query.accountId || req.body?.accountId;
      const isForce = req.query.force === 'true' || req.body?.force === true;
      let query = supabaseAdmin
        .from('linkedin_accounts')
        .select('id, unipile_account_id, withdraw_after_days, team_id')
        .eq('is_valid', true);

      if (!isForce) query = query.eq('auto_withdraw_invites', true);
      if (specificAccountId) query = query.eq('unipile_account_id', specificAccountId);

      if (!isValidCron && userId) {
        const { data: teams } = await supabaseAdmin.from('teams').select('id').eq('owner_id', userId).limit(1);
        const teamId = teams?.[0]?.id;
        if (!teamId) return res.status(403).json({ error: 'Equipo no encontrado' });
        query = query.eq('team_id', teamId);
      }

      const { data: accounts, error: dbError } = await query;
      if (dbError) throw new Error(dbError.message);
      if (!accounts || accounts.length === 0) {
        return res.status(200).json({ message: 'No hay cuentas con auto-withdraw activo', withdrawn: 0 });
      }

      const results = [];
      for (const account of accounts) {
        const cutoffDays = account.withdraw_after_days ?? 15;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - cutoffDays);
        let withdrawn = 0, errors = 0;

        try {
          const invUrl = `${unipileBase()}/api/v1/users/invite/sent?account_id=${account.unipile_account_id}&limit=100`;
          console.log(`[WITHDRAW] Fetching sent invitations for account ${account.unipile_account_id}: ${invUrl}`);
          const invResp = await fetch(invUrl, { headers: unipileHeaders() });
          console.log(`[WITHDRAW] Invitations response status: ${invResp.status}`);
          if (!invResp.ok) {
            const errText = await invResp.text();
            console.error(`[WITHDRAW] Failed to fetch invitations for ${account.unipile_account_id}: ${errText}`);
            results.push({ accountId: account.unipile_account_id, error: `HTTP ${invResp.status}: ${errText}` });
            continue;
          }
          const invData = await invResp.json();
          // Log the raw Unipile payload structure for debugging
          console.log(`[WITHDRAW] Raw payload keys: ${JSON.stringify(Object.keys(invData))}`);
          console.log(`[WITHDRAW] Sample invitation:`, JSON.stringify((invData.items || invData.data || invData.invitations || [])[0] || 'none').slice(0, 2000));
          const rawInvitations = invData.items || invData.data || invData.invitations || [];
          // Filter: only process "sent" / outbound invitations, skip received ones
          const invitations = rawInvitations.filter(inv => {
            // Unipile may use is_received, direction, or type to indicate direction
            if (inv.is_received === true) return false;
            if (inv.direction === 'received' || inv.direction === 'incoming') return false;
            // Accept: explicitly sent, pending, or no direction marker (default outbound)
            return true;
          });
          console.log(`[WITHDRAW] Found ${rawInvitations.length} total, ${invitations.length} outbound invitations for ${account.unipile_account_id}. Cutoff: ${cutoffDate.toISOString()}`);

          for (const inv of invitations) {
            const sentAt = parseSentDate(inv.date);
            const invId = inv.id || inv.provider_id;
            console.log(`[WITHDRAW] Invitation ${invId} | date="${inv.date}" | parsed=${sentAt ? sentAt.toISOString() : 'null'} | cutoff=${cutoffDate.toISOString()} | force=${isForce}`);
            if (!isForce && (!sentAt || sentAt >= cutoffDate)) {
              console.log(`[WITHDRAW] Skipping ${invId}: sent ${sentAt ? sentAt.toISOString() : '(no date)'} — not old enough`);
              continue;
            }
            try {
              // The GET endpoint is: GET /api/v1/users/invite/sent?account_id=...
              // So the DELETE for a specific sent invite should mirror that path:
              // DELETE /api/v1/users/invite/sent/{id}?account_id=...
              // We also try account_id as query param (same as GET) since body may be ignored on DELETE
              const acctQ = `account_id=${account.unipile_account_id}`;
              const base = unipileBase();
              const strategies = [
                // Most likely: mirrors GET resource path, account_id as query param
                { url: `${base}/api/v1/users/invite/sent/${invId}?${acctQ}`, body: null },
                // Fallback: same but account_id in body
                { url: `${base}/api/v1/users/invite/sent/${invId}`, body: JSON.stringify({ account_id: account.unipile_account_id }) },
                // Fallback: without 'sent'
                { url: `${base}/api/v1/users/invite/${invId}?${acctQ}`, body: null },
                // Fallback: user public id
                { url: `${base}/api/v1/users/${inv.invited_user_public_id}/invite?${acctQ}`, body: null },
              ];

              let wResp = null;
              for (const strategy of strategies) {
                console.log(`[WITHDRAW] Trying DELETE ${strategy.url}`);
                wResp = await fetch(strategy.url, {
                  method: 'DELETE',
                  headers: unipileHeaders(),
                  ...(strategy.body ? { body: strategy.body } : {}),
                });
                console.log(`[WITHDRAW] → ${wResp.status}`);
                if (wResp.ok) break;
                const errBody = await wResp.text();
                console.warn(`[WITHDRAW] Strategy failed (${wResp.status}): ${errBody}`);
              }
              console.log(`[WITHDRAW] DELETE ${invId} → ${wResp.status}`);
              if (wResp.ok) {
                withdrawn++;
                console.log(`[WITHDRAW] ✅ Invitación ${invId} eliminada exitosamente para cuenta ${account.unipile_account_id}`);
              } else {
                console.error(`[WITHDRAW] All strategies failed for invitation ${invId}`);
                errors++;
              }
            } catch (delErr) { console.error(`[WITHDRAW] Exception deleting ${inv.id}:`, delErr.message); errors++; }
            await new Promise(r => setTimeout(r, 300));
          }
          results.push({ accountId: account.unipile_account_id, withdrawn, errors });
        } catch (accErr) {
          results.push({ accountId: account.unipile_account_id, error: accErr.message });
        }
      }

      const totalWithdrawn = results.reduce((sum, r) => sum + (r.withdrawn || 0), 0);
      return res.status(200).json({
        message: `Auto-withdraw completado. ${totalWithdrawn} invitaciones retiradas.`,
        results,
        totalWithdrawn,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Error en auto-withdraw' });
    }
  }

  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });

  // GET - listar cuentas LinkedIn del usuario
  if (req.method === 'GET') {
    const teamId = await getOrCreateTeam(userId);
    if (!teamId) return res.status(200).json({ success: true, accounts: [] });

    const { data: accounts, error } = await supabaseAdmin
      .from('linkedin_accounts')
      .select('id, team_id, username, profile_name, is_valid, created_at, last_validated_at, unipile_account_id, max_actions_per_hour')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ success: true, accounts: accounts || [] });
  }

  // POST - conectar cuenta usando cookie li_at (el método profesional, como Walead/Expandi)
  if (req.method === 'POST') {
    const { li_at } = req.body || {};

    if (!li_at || li_at.trim().length < 20) {
      return res.status(400).json({
        error: 'El valor de la cookie li_at es requerido. Debe tener al menos 20 caracteres.'
      });
    }

    const liAtClean = li_at.trim();

    // Validar la cookie contra LinkedIn
    const validation = await validateLiAtCookie(liAtClean);

    if (!validation.valid) {
      return res.status(401).json({ error: validation.error });
    }

    // Guardar en Supabase
    const teamId = await getOrCreateTeam(userId);
    if (!teamId) return res.status(500).json({ error: 'No se pudo obtener el equipo' });

    const profileName = validation.profileName || 'Usuario LinkedIn';
    const username = validation.publicId || profileName.toLowerCase().replace(/\s+/g, '-') || 'linkedin';

    // Comprobar si ya existe una cuenta con el mismo username
    const { data: existing } = await supabaseAdmin
      .from('linkedin_accounts')
      .select('id')
      .eq('team_id', teamId)
      .eq('username', username)
      .limit(1);

    if (existing && existing.length > 0) {
      // Actualizar la cookie de la cuenta existente
      const { error: updateError } = await supabaseAdmin
        .from('linkedin_accounts')
        .update({
          session_cookie: liAtClean,
          is_valid: true,
          last_validated_at: new Date().toISOString(),
          profile_name: profileName,
        })
        .eq('id', existing[0].id);

      if (updateError) return res.status(500).json({ error: updateError.message });

      return res.status(200).json({
        success: true,
        message: `✓ Sesión de ${profileName} actualizada correctamente`,
        accountId: existing[0].id,
      });
    }

    // Insertar nueva cuenta
    const { data: account, error: insertError } = await supabaseAdmin
      .from('linkedin_accounts')
      .insert({
        team_id: teamId,
        username,
        profile_name: profileName,
        session_cookie: liAtClean,
        connection_method: 'cookie',
        is_valid: true,
        last_validated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error('[DB] Error insertando cuenta:', insertError.message);
      return res.status(500).json({ error: insertError.message });
    }

    // Intentar registrar en Unipile asíncronamente (para no bloquear la respuesta)
    // Pero devolvemos el ID de la cuenta creada en nuestra DB
    registerUnipileAccount(liAtClean).then(async (unipile) => {
      if (unipile.success) {
        // Clear any conflicting unipile_account_id from other rows before setting ours
        // This prevents "duplicate key violates unique constraint idx_linkedin_accounts_unipile_id"
        await supabaseAdmin
          .from('linkedin_accounts')
          .update({ unipile_account_id: null })
          .eq('unipile_account_id', unipile.accountId)
          .neq('id', account.id);

        await supabaseAdmin
          .from('linkedin_accounts')
          .update({ 
            unipile_account_id: unipile.accountId,
            connection_method: 'unipile',
            last_unipile_error: null
          })
          .eq('id', account.id);
      } else {
        await supabaseAdmin
          .from('linkedin_accounts')
          .update({ last_unipile_error: unipile.error })
          .eq('id', account.id);
      }
    }).catch(console.error);

    return res.status(200).json({
      success: true,
      message: `✓ Cuenta de ${profileName} conectada exitosamente`,
      accountId: account?.id,
    });
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'ID de cuenta requerido' });

    // Obtener el equipo del usuario
    const { data: teams } = await supabaseAdmin
      .from('teams')
      .select('id')
      .eq('owner_id', userId)
      .limit(1);

    const teamId = teams?.[0]?.id;
    if (!teamId) return res.status(404).json({ error: 'Cuenta no encontrada' });

    // Verificar que la cuenta pertenece al equipo del usuario
    const { data: account } = await supabaseAdmin
      .from('linkedin_accounts')
      .select('id, unipile_account_id')
      .eq('id', id)
      .eq('team_id', teamId)
      .single();

    if (!account) return res.status(404).json({ error: 'Cuenta no encontrada' });

    // Si es cuenta Unipile, desconectar también en Unipile
    if (account.unipile_account_id) {
      const dsn = (process.env.UNIPILE_DSN || '').trim();
      const apiKey = (process.env.UNIPILE_API_KEY || '').trim();
      if (dsn && apiKey) {
        try {
          await fetch(`https://${dsn}/api/v1/accounts/${account.unipile_account_id}`, {
            method: 'DELETE',
            headers: { 'X-API-KEY': apiKey },
          });
        } catch { /* best-effort */ }
      }
    }

    const { error } = await supabaseAdmin
      .from('linkedin_accounts')
      .delete()
      .eq('id', id);

    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ success: true, message: 'Cuenta desconectada' });
  }

  // PATCH /api/linkedin/accounts?id=<uuid> — actualizar campos de configuración
  if (req.method === 'PATCH') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'ID de cuenta requerido' });

    const { max_actions_per_hour, auto_withdraw_invites, withdraw_after_days } = req.body || {};

    const updates = { updated_at: new Date().toISOString() };

    if (max_actions_per_hour !== undefined) {
      if (
        !Number.isInteger(max_actions_per_hour) ||
        max_actions_per_hour < 1 ||
        max_actions_per_hour > 200
      ) {
        return res.status(400).json({ error: 'max_actions_per_hour debe ser un entero entre 1 y 200' });
      }
      updates.max_actions_per_hour = max_actions_per_hour;
    }

    if (auto_withdraw_invites !== undefined) {
      updates.auto_withdraw_invites = Boolean(auto_withdraw_invites);
    }

    if (withdraw_after_days !== undefined) {
      const days = parseInt(withdraw_after_days);
      if (isNaN(days) || days < 1 || days > 365) {
        return res.status(400).json({ error: 'withdraw_after_days debe ser un entero entre 1 y 365' });
      }
      updates.withdraw_after_days = days;
    }

    if (Object.keys(updates).length === 1) {
      return res.status(400).json({ error: 'No hay campos válidos para actualizar' });
    }

    // Verificar que la cuenta pertenece al equipo del usuario
    const { data: teams } = await supabaseAdmin
      .from('teams')
      .select('id')
      .eq('owner_id', userId)
      .limit(1);

    const teamId = teams?.[0]?.id;
    if (!teamId) return res.status(404).json({ error: 'Cuenta no encontrada' });

    const { error: patchError } = await supabaseAdmin
      .from('linkedin_accounts')
      .update(updates)
      .eq('id', id)
      .eq('team_id', teamId);

    if (patchError) return res.status(500).json({ error: patchError.message });
    return res.status(200).json({ success: true, ...updates });
  }

  return res.status(405).json({ error: 'Método no permitido' });
}
