import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// ─── Variables de entorno requeridas ──────────────────────────────────────────
// SUPABASE_URL              → URL de tu proyecto Supabase
// SUPABASE_SERVICE_ROLE_KEY → Service Role Key (omite RLS)
// TALENTSCOPE_MASTER_SECRET → Secreto compartido con TalentScope para autenticar
//                             las llamadas a este endpoint. Debe ser un string largo
//                             y aleatorio. Configurar también en Vercel → Settings →
//                             Environment Variables.
// ─────────────────────────────────────────────────────────────────────────────

// Cliente Supabase con Service Role Key → bypasea RLS en todas las tablas
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ─── Headers CORS comunes ─────────────────────────────────────────────────────
// Permite peticiones de cualquier origen (o restringe a TALENTSCOPE_ORIGIN si lo
// prefieres). El endpoint es seguro porque requiere TALENTSCOPE_MASTER_SECRET.
function setCorsHeaders(res) {
  const allowedOrigin = process.env.TALENTSCOPE_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// ─── Handler principal ────────────────────────────────────────────────────────
export default async function handler(req, res) {
  setCorsHeaders(res);

  // Pre-flight CORS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Solo POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  // ─── 1. Autenticación del sistema llamante ──────────────────────────────────
  const masterSecret = process.env.TALENTSCOPE_MASTER_SECRET;
  if (!masterSecret) {
    console.error('[PROVISION] TALENTSCOPE_MASTER_SECRET no configurado en las variables de entorno.');
    return res.status(500).json({ error: 'Error de configuración del servidor.' });
  }

  const authHeader = req.headers.authorization || '';
  // Acepta tanto "Bearer <secret>" como el secreto directamente
  const receivedSecret = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : authHeader.trim();

  // Comparación en tiempo constante para evitar timing attacks
  const masterBuf   = Buffer.from(masterSecret);
  const receivedBuf = Buffer.from(receivedSecret);
  const secretsMatch =
    masterBuf.length === receivedBuf.length &&
    crypto.timingSafeEqual(masterBuf, receivedBuf);

  if (!secretsMatch) {
    console.warn('[PROVISION] Intento de acceso con secreto inválido.');
    return res.status(401).json({ error: 'No autorizado.' });
  }

  // ─── 2. Validación del body ─────────────────────────────────────────────────
  const { email, userId: talentscopeUserId, name } = req.body || {};

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'El campo "email" es requerido y debe ser válido.' });
  }
  if (!talentscopeUserId || typeof talentscopeUserId !== 'string') {
    return res.status(400).json({ error: 'El campo "userId" es requerido.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const displayName = (name || normalizedEmail.split('@')[0]).trim();

  try {
    // ─── 3. Buscar usuario existente por email ────────────────────────────────
    // Primero buscamos en la tabla pública 'users' (la que usa la app)
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id, email')
      .eq('email', normalizedEmail)
      .maybeSingle();

    let userId;

    if (existingUser) {
      // El usuario ya existe → reutilizamos su ID
      userId = existingUser.id;
      console.log(`[PROVISION] Usuario existente encontrado: ${userId} (${normalizedEmail})`);
    } else {
      // ─── 4. Crear usuario nuevo en Supabase Auth + tabla users ─────────────
      //
      // Usamos createUser con email_confirm: true para que el usuario ya esté
      // confirmado sin necesidad de verificar su correo (shadow provisioning).
      // Generamos una contraseña aleatoria segura; el usuario nunca la verá
      // (podrá hacer "Olvidé mi contraseña" si quiere acceder directamente).
      const randomPassword = `efi_${crypto.randomUUID()}`;

      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: normalizedEmail,
        password: randomPassword,
        email_confirm: true,           // confirmar email automáticamente
        user_metadata: {
          full_name: displayName,
          provisioned_by: 'talentscope',
          talentscope_user_id: talentscopeUserId,
        },
      });

      if (authError) {
        // Si el usuario ya existe en auth pero no en nuestra tabla (edge case),
        // intentamos recuperar su ID
        if (authError.message?.toLowerCase().includes('already registered') ||
            authError.code === 'email_exists') {
          const { data: { users: authUsers } } = await supabaseAdmin.auth.admin.listUsers();
          const found = authUsers?.find(u => u.email === normalizedEmail);
          if (found) {
            userId = found.id;
            console.warn(`[PROVISION] Usuario en auth pero no en tabla users: ${userId}`);
          } else {
            console.error('[PROVISION] Error creando usuario en Auth:', authError.message);
            return res.status(500).json({ error: `Error creando usuario: ${authError.message}` });
          }
        } else {
          console.error('[PROVISION] Error creando usuario en Auth:', authError.message);
          return res.status(500).json({ error: `Error creando usuario: ${authError.message}` });
        }
      } else {
        userId = authData.user.id;
      }

      // Insertar en tabla pública 'users' (puede fallar si ya existe → ignoramos)
      const { error: dbError } = await supabaseAdmin
        .from('users')
        .insert({
          id: userId,
          email: normalizedEmail,
          full_name: displayName,
          subscription_status: 'free',
          subscription_plan: 'free',
          // Guardamos el userId del sistema externo por trazabilidad
          // Si tu tabla no tiene esta columna, elimina esta línea
          // talentscope_user_id: talentscopeUserId,
        });

      if (dbError && dbError.code !== '23505') {
        // 23505 = unique_violation → el row ya existe, no es un error real
        console.error('[PROVISION] Error insertando en tabla users:', dbError.message);
        return res.status(500).json({ error: `Error creando perfil: ${dbError.message}` });
      }

      console.log(`[PROVISION] ✓ Nuevo usuario creado: ${userId} (${normalizedEmail})`);
    }

    // ─── 5. Generar o recuperar API Key ──────────────────────────────────────
    //
    // La tabla api_keys tiene un UNIQUE(user_id), lo que garantiza una sola
    // key por usuario. Si ya existe la devolvemos; si no, la creamos.
    const { data: existingKey } = await supabaseAdmin
      .from('api_keys')
      .select('key_value')
      .eq('user_id', userId)
      .maybeSingle();

    let apiKey;

    if (existingKey?.key_value) {
      // Ya tiene API Key → la reutilizamos (idempotente)
      apiKey = existingKey.key_value;
      console.log(`[PROVISION] API Key existente recuperada para usuario ${userId}`);
    } else {
      // Crear nueva API Key con el mismo formato que usa api/auth.js
      const newKey = `efi_${crypto.randomUUID().replace(/-/g, '')}`;

      const { data: insertedKey, error: keyError } = await supabaseAdmin
        .from('api_keys')
        .insert({ user_id: userId, key_value: newKey })
        .select('key_value')
        .single();

      if (keyError) {
        // Puede haber una condición de carrera con unique_violation → reintentamos SELECT
        if (keyError.code === '23505') {
          const { data: retryKey } = await supabaseAdmin
            .from('api_keys')
            .select('key_value')
            .eq('user_id', userId)
            .single();
          apiKey = retryKey?.key_value;
        } else {
          console.error('[PROVISION] Error creando API Key:', keyError.message);
          return res.status(500).json({ error: `Error generando API Key: ${keyError.message}` });
        }
      } else {
        apiKey = insertedKey.key_value;
      }

      console.log(`[PROVISION] ✓ Nueva API Key generada para usuario ${userId}`);
    }

    // ─── 6. Respuesta exitosa ─────────────────────────────────────────────────
    return res.status(200).json({
      success: true,
      apiKey,
      userId,                  // ID interno de EficacIA — útil para TalentScope
      isNewUser: !existingUser, // booleano informativo
    });

  } catch (err) {
    console.error('[PROVISION] Error inesperado:', err);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
}
