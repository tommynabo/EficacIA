import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, password, name, fullName, stripeCustomerId, stripeSubscriptionId, plan, promoCode } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son requeridos' });
    }

    const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
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
      // Trial a través de Stripe
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 7);
      insertData.stripe_customer_id = stripeCustomerId;
      insertData.stripe_subscription_id = stripeSubscriptionId;
      insertData.subscription_plan = plan || 'starter';
      insertData.subscription_status = 'trial';
      insertData.trial_ends_at = trialEndsAt.toISOString();
    }

    const { data: userData, error: dbError } = await supabase.from('users').insert(insertData).select().single();
    if (dbError) throw new Error(dbError.message);

    const token = jwt.sign({ userId, email }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '7d' });

    return res.status(200).json({ user: userData, token });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(400).json({ error: error.message || 'Error en registro' });
  }
};
