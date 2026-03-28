import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

export default async function handler(req, res) {
  // ─── CORS — must be set before ANY early return ───────────────────────────
  // Allows cross-origin calls from TalentScope (or any other trusted caller).
  // For tighter security replace '*' with process.env.TALENTSCOPE_ORIGIN.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400'); // cache preflight 24 h

  // Preflight — browser sends OPTIONS first; respond immediately so it
  // doesn't block the actual POST/GET that follows.
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query.action;

  if (action === 'login') return handleLogin(req, res);
  if (action === 'register') return handleRegister(req, res);
  if (action === 'me') return handleMe(req, res);
  if (action === 'reset-password') return handleResetPassword(req, res);
  if (action === 'change-password') return handleChangePassword(req, res);
  if (action === 'api-key') return handleApiKey(req, res);
  if (action === 'provision') return handleProvision(req, res);

  return res.status(400).json({ error: 'Acción no válida' });
}

// ── Per-plan AI credit allocations ──────────────────────────────────────────
const PLAN_CREDITS = {
  free: 100,
  pro: 1000,
  growth: 2000,
  scale: 10000,
  scale_oferta: 10000,
  starter: 1000,
  agency: 10000
};



// ─── LOGIN ────────────────────────────────────────────────────────

async function handleLogin(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email y contraseña son requeridos' });

    // Usamos service role para poder insertar en users si hace falta
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY);

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) return res.status(401).json({ error: 'Email o contraseña incorrectos' });

    let { data: userData, error: dbError } = await supabase
      .from('users')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    // ── Auto-heal: el usuario existe en Auth pero le falta el row en users ──
    // Ocurre cuando se crea desde el panel de Supabase o si el INSERT del
    // registro falló silenciosamente (ej. durante el flujo de Stripe).
    if (dbError || !userData) {
      console.warn(`[LOGIN] Perfil no encontrado para ${authData.user.id} — creando row en users...`);

      const fallbackName = authData.user.user_metadata?.full_name
        || authData.user.user_metadata?.name
        || email.split('@')[0];

      // Intentamos primero con todos los campos; si falla por constraint
      // en subscription_plan (columna que puede no existir), reintentamos sin ella.
      let newUser, insertError;
      ({ data: newUser, error: insertError } = await supabase
        .from('users')
        .insert({
          id: authData.user.id,
          email: email.trim().toLowerCase(),
          full_name: fallbackName,
          subscription_status: 'active',
          subscription_plan: 'free',
        })
        .select()
        .single());

      if (insertError) {
        console.warn('[LOGIN] Auto-heal attempt 1 failed:', insertError.message, '— retrying without subscription_plan...');
        // Reintento sin subscription_plan (por si el schema no tiene esa columna
        // o tiene un constraint diferente)
        ({ data: newUser, error: insertError } = await supabase
          .from('users')
          .insert({
            id: authData.user.id,
            email: email.trim().toLowerCase(),
            full_name: fallbackName,
            subscription_status: 'active',
          })
          .select()
          .single());
      }

      if (insertError) {
        console.error('[LOGIN] Error creando perfil auto-heal (ambos intentos):', insertError.message);
        return res.status(500).json({ error: 'Error accediendo al perfil de usuario. Constraint: ' + insertError.message });
      }

      userData = newUser;
      console.log(`[LOGIN] ✓ Perfil creado automáticamente para ${authData.user.id}`);
    }

    const token = jwt.sign({ userId: authData.user.id, email }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '7d' });

    return res.status(200).json({ user: userData, token });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Error en login' });
  }
}

// ─── REGISTER ─────────────────────────────────────────────────────

async function handleRegister(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, password, name, fullName, stripeCustomerId, stripeSubscriptionId, plan, promoCode } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son requeridos' });
    }

    const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const userName = fullName || name || email.split('@')[0];

    // ── Crear usuario en Auth (idempotente: si ya existe, lo reutilizamos) ──
    // Esto resuelve el caso en que un primer intento de registro creó el usuario
    // en Auth pero falló antes de insertar en la tabla users.
    let userId;
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: userName },
    });

    if (authError) {
      // Si el email ya está registrado en Auth, buscamos el usuario existente
      // y lo actualizamos con la nueva contraseña para que el login funcione.
      const isAlreadyExists =
        authError.message?.toLowerCase().includes('already registered') ||
        authError.message?.toLowerCase().includes('already been registered') ||
        authError.code === 'email_exists' ||
        authError.status === 422;

      if (isAlreadyExists) {
        console.warn(`[REGISTER] Email ya existe en Auth: ${email} — recuperando cuenta...`);
        // Buscar el usuario existente listando por email
        const { data: { users: authUsers }, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
        if (listErr) throw new Error(`Error buscando usuario: ${listErr.message}`);
        const existing = authUsers?.find(u => u.email?.toLowerCase() === email.toLowerCase());
        if (!existing) throw new Error('El email ya está registrado pero no se pudo recuperar la cuenta');
        userId = existing.id;
        // Actualizar la contraseña para que coincida con la que acaba de poner
        await supabaseAdmin.auth.admin.updateUserById(userId, { password, email_confirm: true });
        console.log(`[REGISTER] ✓ Contraseña actualizada para usuario existente: ${userId}`);
      } else {
        throw new Error(authError.message);
      }
    } else {
      userId = authData.user.id;
    }

    // ── Build upsert payload ─────────────────────────────────────────────────
    // Usamos upsert (no insert) para que sea idempotente: si el row ya existe
    // lo actualiza con los datos de Stripe; si no existe lo crea.
    const upsertData = {
      id: userId,
      email: email.trim().toLowerCase(),
      full_name: userName,
      subscription_status: 'active',
      subscription_plan: 'free',
      ai_credits: PLAN_CREDITS.free
    };



    // Código de prueba gratis: EficaciaEsLoMejor2026
    if (promoCode === 'EficaciaEsLoMejor2026') {
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 7);
      upsertData.subscription_plan = 'pro';
      upsertData.subscription_status = 'trial';
      upsertData.trial_ends_at = trialEndsAt.toISOString();
      upsertData.ai_credits = PLAN_CREDITS.pro;
    }
 else if (stripeCustomerId && stripeSubscriptionId) {
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 7);
      const planKey = plan || 'starter';
      upsertData.stripe_customer_id = stripeCustomerId;
      upsertData.stripe_subscription_id = stripeSubscriptionId;
      upsertData.subscription_plan = planKey;
      upsertData.subscription_status = 'trial';
      upsertData.trial_ends_at = trialEndsAt.toISOString();

      // Dynamic credits assignment
      const credits = PLAN_CREDITS[planKey.toLowerCase()] || 1000;
      upsertData.ai_credits = credits;
    }


    const { data: userData, error: dbError } = await supabaseAdmin
      .from('users')
      .upsert(upsertData, { onConflict: 'id' })
      .select()
      .single();

    if (dbError) throw new Error(dbError.message);

    const token = jwt.sign({ userId, email }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '7d' });

    console.log(`[REGISTER] ✓ Usuario registrado/actualizado: ${userId} (${email})`);
    return res.status(200).json({ user: userData, token });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(400).json({ error: error.message || 'Error en registro' });
  }
}

// ─── ME (GET / PUT) ───────────────────────────────────────────────

async function handleMe(req, res) {
  if (req.method !== 'GET' && req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });

  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'No autenticado' });

  let decoded;
  try {
    decoded = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET || 'dev-secret');
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY);

  try {
    if (req.method === 'GET') {
      const { data: user, error } = await supabase.from('users').select('*').eq('id', decoded.userId).single();

      if (error || !user) {
        return res.status(200).json({
          id: decoded.userId,
          email: decoded.email,
          full_name: decoded.email?.split('@')[0] || 'Usuario',
          subscription_plan: 'free',
          subscription_status: 'free',
        });
      }
      return res.status(200).json(user);
    }

    if (req.method === 'PUT') {
      const updates = { ...(req.body || {}) };

      // Strip fields that must never be overwritten via this endpoint
      const BLOCKED = ['id', 'email', 'subscription_plan', 'subscription_status',
        'stripe_customer_id', 'stripe_subscription_id', 'created_at', 'role'];
      BLOCKED.forEach(k => delete updates[k]);

      const updateKeys = Object.keys(updates);
      console.log('[auth/me] PUT fields being saved:', updateKeys);

      let { data: user, error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', decoded.userId)
        .select()
        .single();

      if (error) {
        console.error('[auth/me] PUT attempt 1 failed:', {
          message: error.message,
          code:    error.code,
          details: error.details,
          hint:    error.hint,
          fields:  updateKeys,
        });

        // Attempt to reload PostgREST schema cache (no-op if RPC not available)
        try { await supabase.rpc('pg_reload_schema', {}).catch(() => null); } catch { /* ignore */ }
        await new Promise(r => setTimeout(r, 250));

        // Retry
        const retry = await supabase
          .from('users')
          .update(updates)
          .eq('id', decoded.userId)
          .select()
          .single();
        user  = retry.data;
        error = retry.error;

        if (error) {
          console.error('[auth/me] PUT attempt 2 failed:', {
            message: error.message,
            code:    error.code,
            hint:    error.hint,
            fields:  updateKeys,
          });
          return res.status(400).json({
            error:   `Error al actualizar perfil: ${error.message}`,
            code:    error.code,
            details: error.details,
            hint:    error.hint ||
              `Verifica que las columnas [${updateKeys.join(', ')}] existen en la tabla 'users'. ` +
              'Si acabas de ejecutar una migración, recarga el esquema de Supabase o espera ~30 s.',
            fields: updateKeys,
          });
        }
      }
      return res.status(200).json(user);
    }
  } catch (error) {
    console.error('Me error:', error);
    return res.status(500).json({ error: 'Error obteniendo usuario' });
  }
}

// ─── RESET PASSWORD ───────────────────────────────────────────────

async function handleResetPassword(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email } = req.body || {};
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Email inválido' });
  }

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host;
    const redirectTo = `${protocol}://${host}/reset-password`;

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo,
    });

    // Always return success to avoid email enumeration attacks
    if (error) {
      console.error('[RESET-PASSWORD]', error.message);
    }

    return res.status(200).json({
      message: 'Si existe una cuenta con ese email, recibirás un correo con instrucciones.',
    });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ error: 'Error al procesar la solicitud' });
  }
}

// ─── CHANGE PASSWORD ────────────────────────────────────────

async function handleChangePassword(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'No autenticado' });

  let userId;
  try {
    const decoded = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET || 'dev-secret');
    userId = decoded.userId;
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }

  const { newPassword } = req.body || {};
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
  }

  try {
    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: newPassword,
    });
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ success: true, message: 'Contraseña actualizada correctamente' });
  } catch (err) {
    console.error('[CHANGE-PASSWORD]', err);
    return res.status(500).json({ error: 'Error actualizando contraseña' });
  }
}

// ─── API KEY (GET / POST) ─────────────────────────────────────────

async function handleApiKey(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  let userId;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    userId = decoded.userId;
  } catch {
    return res.status(401).json({ error: 'No autenticado' });
  }

  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
  );

  if (req.method === 'GET') {
    try {
      const { data, error } = await supabaseAdmin
        .from('users')
        .select('extension_token')
        .eq('id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        return res.status(500).json({ error: error.message });
      }
      return res.status(200).json({ apiKey: data?.extension_token || null });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // POST: ensure the user has a lifetime token (generate if missing)
  if (req.method === 'POST') {
    try {
      const { data: existing } = await supabaseAdmin
        .from('users')
        .select('extension_token')
        .eq('id', userId)
        .single();

      if (existing?.extension_token) {
        return res.status(200).json({ apiKey: existing.extension_token });
      }

      const newToken = crypto.randomUUID();
      const { data, error } = await supabaseAdmin
        .from('users')
        .update({ extension_token: newToken })
        .eq('id', userId)
        .select('extension_token')
        .single();

      if (error) {
        return res.status(500).json({ error: error.message });
      }
      return res.status(200).json({ apiKey: data.extension_token });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
}

// ─── PROVISION (TalentScope → EficacIA Shadow Account) ───────────────────────
// Endpoint interno — solo accesible con TALENTSCOPE_MASTER_SECRET
// POST /api/auth?action=provision
// Body: { email, userId, name }

async function handleProvision(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  // ── 1. Autenticación del sistema llamante ────────────────────────────────
  const masterSecret = process.env.TALENTSCOPE_MASTER_SECRET;
  if (!masterSecret) {
    console.error('[PROVISION] TALENTSCOPE_MASTER_SECRET no configurado.');
    return res.status(500).json({ error: 'Error de configuración del servidor.' });
  }

  const authHeader = req.headers.authorization || '';
  const receivedSecret = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : authHeader.trim();

  // Comparación en tiempo constante (evita timing attacks)
  const masterBuf   = Buffer.from(masterSecret);
  const receivedBuf = Buffer.from(receivedSecret);
  const secretsMatch =
    masterBuf.length === receivedBuf.length &&
    crypto.timingSafeEqual(masterBuf, receivedBuf);

  if (!secretsMatch) {
    console.warn('[PROVISION] Intento de acceso con secreto inválido.');
    return res.status(401).json({ error: 'No autorizado.' });
  }

  // ── 2. Validación del body ───────────────────────────────────────────────
  const { email, userId: talentscopeUserId, name } = req.body || {};

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'El campo "email" es requerido y debe ser válido.' });
  }
  if (!talentscopeUserId || typeof talentscopeUserId !== 'string') {
    return res.status(400).json({ error: 'El campo "userId" es requerido.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const displayName     = (name || normalizedEmail.split('@')[0]).trim();

  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    // ── 3. Buscar usuario existente por email ────────────────────────────
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id, email')
      .eq('email', normalizedEmail)
      .maybeSingle();

    let userId;
    const isNewUser = !existingUser;

    if (existingUser) {
      userId = existingUser.id;
      console.log(`[PROVISION] Usuario existente: ${userId} (${normalizedEmail})`);
    } else {
      // ── 4. Crear usuario en Supabase Auth + tabla users ────────────────
      const randomPassword = `efi_${crypto.randomUUID()}`;

      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: normalizedEmail,
        password: randomPassword,
        email_confirm: true,
        user_metadata: {
          full_name: displayName,
          provisioned_by: 'talentscope',
          talentscope_user_id: talentscopeUserId,
        },
      });

      if (authError) {
        // Edge case: existe en auth pero no en tabla users
        if (authError.message?.toLowerCase().includes('already registered') ||
            authError.code === 'email_exists') {
          const { data: { users: authUsers } } = await supabaseAdmin.auth.admin.listUsers();
          const found = authUsers?.find(u => u.email === normalizedEmail);
          if (found) {
            userId = found.id;
          } else {
            console.error('[PROVISION] Error Auth:', authError.message);
            return res.status(500).json({ error: `Error creando usuario: ${authError.message}` });
          }
        } else {
          console.error('[PROVISION] Error Auth:', authError.message);
          return res.status(500).json({ error: `Error creando usuario: ${authError.message}` });
        }
      } else {
        userId = authData.user.id;
      }

      const { error: dbError } = await supabaseAdmin
        .from('users')
        .insert({
          id: userId,
          email: normalizedEmail,
          full_name: displayName,
          subscription_status: 'free',
          subscription_plan: 'free',
        });

      if (dbError && dbError.code !== '23505') {
        console.error('[PROVISION] Error tabla users:', dbError.message);
        return res.status(500).json({ error: `Error creando perfil: ${dbError.message}` });
      }

      console.log(`[PROVISION] ✓ Nuevo usuario: ${userId} (${normalizedEmail})`);
    }

    // ── 5. Generar o recuperar API Key ────────────────────────────────────
    const { data: existingKey } = await supabaseAdmin
      .from('api_keys')
      .select('key_value')
      .eq('user_id', userId)
      .maybeSingle();

    let apiKey;

    if (existingKey?.key_value) {
      apiKey = existingKey.key_value;
      console.log(`[PROVISION] API Key existente para ${userId}`);
    } else {
      const newKey = `efi_${crypto.randomUUID().replace(/-/g, '')}`;
      const { data: insertedKey, error: keyError } = await supabaseAdmin
        .from('api_keys')
        .insert({ user_id: userId, key_value: newKey })
        .select('key_value')
        .single();

      if (keyError) {
        if (keyError.code === '23505') {
          // Race condition — recuperar la existente
          const { data: retryKey } = await supabaseAdmin
            .from('api_keys').select('key_value').eq('user_id', userId).single();
          apiKey = retryKey?.key_value;
        } else {
          console.error('[PROVISION] Error API Key:', keyError.message);
          return res.status(500).json({ error: `Error generando API Key: ${keyError.message}` });
        }
      } else {
        apiKey = insertedKey.key_value;
      }

      console.log(`[PROVISION] ✓ Nueva API Key para ${userId}`);
    }

    // ── 6. Respuesta ──────────────────────────────────────────────────────
    return res.status(200).json({ success: true, apiKey, userId, isNewUser });

  } catch (err) {
    console.error('[PROVISION] Error inesperado:', err);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
}
