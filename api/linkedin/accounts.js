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
      .select('id, team_id, username, profile_name, is_valid, created_at, last_validated_at, unipile_account_id')
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
        is_valid: true,
        last_validated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error('[DB] Error insertando cuenta:', insertError.message);
      return res.status(500).json({ error: insertError.message });
    }

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

  return res.status(405).json({ error: 'Método no permitido' });
}
