import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'No autenticado' });

    let decoded;
    try {
      decoded = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET || 'dev-secret');
    } catch {
      return res.status(401).json({ error: 'Token inválido' });
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY);
    const { data: user, error } = await supabase.from('users').select('*').eq('id', decoded.userId).single();

    if (error || !user) {
      // Fallback: keep the session alive using JWT claims
      return res.status(200).json({
        id: decoded.userId,
        email: decoded.email,
        full_name: decoded.email?.split('@')[0] || 'Usuario',
        subscription_plan: 'free',
        subscription_status: 'free',
      });
    }
    return res.status(200).json(user);
  } catch (error) {
    console.error('Get user error:', error);
    return res.status(500).json({ error: 'Error obteniendo usuario' });
  }
};
