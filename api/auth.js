import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query.action;

  if (action === 'login') return handleLogin(req, res);
  if (action === 'register') return handleRegister(req, res);
  if (action === 'me') return handleMe(req, res);

  return res.status(400).json({ error: 'Acción no válida' });
}

// ─── LOGIN ────────────────────────────────────────────────────────

async function handleLogin(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email y contraseña son requeridos' });

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) return res.status(401).json({ error: 'Email o contraseña incorrectos' });

    const { data: userData, error: dbError } = await supabase.from('users').select('*').eq('id', authData.user.id).single();
    if (dbError) return res.status(404).json({ error: 'Perfil no encontrado' });

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

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email, password, email_confirm: true,
    });

    if (authError) throw new Error(authError.message);

    const userId = authData.user.id;
    const insertData = { id: userId, email, full_name: userName, subscription_status: 'free' };

    // Código de prueba gratis: EficaciaEsLoMejor2026
    if (promoCode === 'EficaciaEsLoMejor2026') {
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 7);
      insertData.subscription_plan = 'pro';
      insertData.subscription_status = 'trial';
      insertData.trial_ends_at = trialEndsAt.toISOString();
    } else if (stripeCustomerId && stripeSubscriptionId) {
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 7);
      insertData.stripe_customer_id = stripeCustomerId;
      insertData.stripe_subscription_id = stripeSubscriptionId;
      insertData.subscription_plan = plan || 'starter';
      insertData.subscription_status = 'trial';
      insertData.trial_ends_at = trialEndsAt.toISOString();
    }

    const { data: userData, error: dbError } = await supabaseAdmin.from('users').insert(insertData).select().single();
    if (dbError) throw new Error(dbError.message);

    const token = jwt.sign({ userId, email }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '7d' });

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
      const { full_name, timezone } = req.body || {};
      const updates = {};
      if (full_name !== undefined) updates.full_name = full_name;
      if (timezone !== undefined) updates.timezone = timezone;
      
      const { data: user, error } = await supabase.from('users').update(updates).eq('id', decoded.userId).select().single();
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json(user);
    }
  } catch (error) {
    console.error('Me error:', error);
    return res.status(500).json({ error: 'Error obteniendo usuario' });
  }
}
