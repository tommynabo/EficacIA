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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });

  const { id } = req.query;

  if (req.method === 'DELETE') {
    // Verificar que la cuenta pertenece al usuario
    const { data: account } = await supabaseAdmin
      .from('linkedin_accounts')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (!account) return res.status(404).json({ error: 'Cuenta no encontrada' });

    const { error } = await supabaseAdmin
      .from('linkedin_accounts')
      .delete()
      .eq('id', id);

    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ success: true, message: 'Cuenta desconectada' });
  }

  return res.status(405).json({ error: 'Método no permitido' });
}
