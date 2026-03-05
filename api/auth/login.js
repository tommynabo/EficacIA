import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
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
};
