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
  if (!id) return res.status(400).json({ error: 'ID de lead requerido' });

  if (req.method === 'DELETE') {
    // Verificar que el lead pertenece al usuario
    const { data: teams } = await supabaseAdmin
      .from('teams')
      .select('id')
      .eq('owner_id', userId);

    const teamIds = (teams || []).map((t) => t.id);
    if (teamIds.length === 0)
      return res.status(404).json({ error: 'Lead no encontrado' });

    const { error } = await supabaseAdmin
      .from('leads')
      .delete()
      .eq('id', id)
      .in('team_id', teamIds);

    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ success: true, message: 'Lead eliminado' });
  }

  return res.status(405).json({ error: 'Método no permitido' });
}
