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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });

  if (req.method === 'GET') {
    const { status, search, limit = 50, offset = 0, campaign_id } = req.query;

    // Obtener teamId del usuario
    const { data: teams } = await supabaseAdmin
      .from('teams')
      .select('id')
      .eq('owner_id', userId)
      .limit(1);

    if (!teams || teams.length === 0) return res.status(200).json({ leads: [] });
    const teamId = teams[0].id;

    let query = supabaseAdmin
      .from('leads')
      .select('*')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (status) query = query.eq('status', status);
    if (campaign_id) query = query.eq('campaign_id', campaign_id);
    if (search) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,company.ilike.%${search}%,linkedin_url.ilike.%${search}%`
      );
    }

    const { data: leads, error } = await query;

    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ success: true, leads: leads || [] });
  }

  return res.status(405).json({ error: 'Método no permitido' });
}
