import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Variables de entorno necesarias:
// UNIPILE_DSN              → Tu DSN de Unipile
// UNIPILE_API_KEY          → Tu API Key de Unipile
// UNIPILE_WEBHOOK_SECRET   → (Opcional) Secreto para verificar la firma del webhook
// SUPABASE_URL             → URL de tu proyecto Supabase
// SUPABASE_SERVICE_ROLE_KEY → Clave de servicio de Supabase

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

/**
 * Obtener o crear equipo para un usuario (misma lógica que accounts.js)
 */
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

  if (error) { console.error('[WEBHOOK][TEAM]', error.message); return null; }
  return newTeam?.id || null;
}

/**
 * Verifica la firma del webhook de Unipile (si está configurada).
 * Unipile puede enviar un header x-webhook-signature con HMAC-SHA256.
 */
function verifyWebhookSignature(req) {
  const secret = process.env.UNIPILE_WEBHOOK_SECRET;
  if (!secret) {
    // Si no hay secreto configurado, aceptar (pero logear aviso)
    console.warn('[WEBHOOK] UNIPILE_WEBHOOK_SECRET no configurado. Webhook sin verificar.');
    return true;
  }

  const signature = req.headers['x-webhook-signature'] || req.headers['x-unipile-signature'];
  if (!signature) {
    console.warn('[WEBHOOK] Webhook recibido sin firma.');
    return false;
  }

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

/**
 * POST /api/webhooks/unipile
 * 
 * Webhook que Unipile llama cuando un usuario completa el flujo
 * de conexión de su cuenta de LinkedIn.
 * 
 * Eventos relevantes:
 * - account.created   → Cuenta nueva conectada
 * - account.connected → Cuenta reconectada
 * - account.updated   → Actualización de estado
 */
export default async function handler(req, res) {
  // Solo aceptar POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    // 1. Verificar firma del webhook (seguridad)
    if (!verifyWebhookSignature(req)) {
      console.error('[WEBHOOK] Firma inválida. Posible ataque.');
      return res.status(401).json({ error: 'Firma de webhook inválida.' });
    }

    const payload = req.body;
    console.log('[WEBHOOK] Evento recibido de Unipile:', JSON.stringify(payload, null, 2));

    // 2. Extraer datos del evento
    // Estructura típica de Unipile:
    // {
    //   "event": "account.created",
    //   "data": {
    //     "account_id": "...",
    //     "provider": "LINKEDIN",
    //     "external_id": "nuestro-user-id",
    //     "name": "...",
    //     "status": "OK"
    //   }
    // }
    const event = payload.event || payload.type;
    const data = payload.data || payload;

    // Eventos que nos interesan
    const eventosConexion = ['account.created', 'account.connected', 'account_connected'];
    
    if (!eventosConexion.includes(event)) {
      console.log(`[WEBHOOK] Evento "${event}" ignorado (no es de conexión).`);
      // Responder 200 para que Unipile no reintente
      return res.status(200).json({ received: true, processed: false });
    }

    // 3. Extraer campos necesarios
    const unipileAccountId = data.account_id || data.accountId || data.id;
    const externalId = data.external_id || data.externalId; // Nuestro user_id
    const provider = data.provider || 'LINKEDIN';
    const accountName = data.name || data.account_name || null;
    const status = data.status || 'OK';

    if (!unipileAccountId) {
      console.error('[WEBHOOK] account_id no encontrado en el payload:', JSON.stringify(data));
      return res.status(400).json({ error: 'Falta account_id en el payload.' });
    }

    if (!externalId) {
      console.error('[WEBHOOK] external_id (user_id) no encontrado:', JSON.stringify(data));
      return res.status(400).json({ error: 'Falta external_id (user_id) en el payload.' });
    }

    // 4. Verificar que el usuario existe y obtener/crear su equipo
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', externalId)
      .single();

    if (userError || !user) {
      console.error(`[WEBHOOK] Usuario ${externalId} no encontrado en la base de datos.`);
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    // Obtener o crear equipo del usuario (misma lógica que accounts.js)
    const teamId = await getOrCreateTeam(externalId);
    if (!teamId) {
      console.error(`[WEBHOOK] No se pudo obtener/crear equipo para usuario ${externalId}`);
      return res.status(500).json({ error: 'Error al obtener equipo del usuario.' });
    }

    // 5. Buscar si ya existe una cuenta con este unipile_account_id (evitar duplicados)
    const { data: existingAccount } = await supabaseAdmin
      .from('linkedin_accounts')
      .select('id')
      .eq('unipile_account_id', unipileAccountId)
      .single();

    if (existingAccount) {
      // Actualizar la cuenta existente (reconexión)
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

    // 6. Crear nueva cuenta en linkedin_accounts
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
        session_cookie: 'managed_by_unipile', // No necesitamos la cookie real
        last_validated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error('[WEBHOOK] Error al insertar cuenta:', insertError.message);
      return res.status(500).json({ error: 'Error al guardar la cuenta de LinkedIn.' });
    }

    console.log(`[WEBHOOK] ✓ Nueva cuenta LinkedIn creada: ${newAccount.id} (Unipile: ${unipileAccountId}) → usuario ${externalId}`);

    return res.status(200).json({ 
      received: true, 
      action: 'created',
      accountId: newAccount.id 
    });

  } catch (err) {
    console.error('[WEBHOOK] Error interno:', err);
    // Siempre devolver 200 para webhooks para evitar reintentos infinitos
    return res.status(200).json({ received: true, error: 'Error interno procesado.' });
  }
}
