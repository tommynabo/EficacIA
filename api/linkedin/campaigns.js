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

async function getOrCreateTeam(userId) {
  const { data: teams } = await supabaseAdmin
    .from('teams')
    .select('id')
    .eq('owner_id', userId)
    .limit(1);

  if (teams && teams.length > 0) return teams[0].id;

  // Crear equipo automáticamente
  const { data: newTeam } = await supabaseAdmin
    .from('teams')
    .insert({ owner_id: userId, name: 'Mi Equipo', description: 'Equipo principal' })
    .select()
    .single();

  return newTeam?.id || null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });

  // GET - listar campañas
  if (req.method === 'GET') {
    const teamId = await getOrCreateTeam(userId);
    if (!teamId) return res.status(200).json({ campaigns: [] });

    const { data: campaigns, error } = await supabaseAdmin
      .from('campaigns')
      .select('*')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ success: true, campaigns: campaigns || [] });
  }

  // POST - crear campaña
  if (req.method === 'POST') {
    const { name, description } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Nombre de campaña requerido' });

    const teamId = await getOrCreateTeam(userId);
    if (!teamId) return res.status(500).json({ error: 'No se pudo crear el equipo' });

    const { data: campaign, error } = await supabaseAdmin
      .from('campaigns')
      .insert({
        team_id: teamId,
        name,
        description: description || '',
        status: 'draft',
        leads_count: 0,
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(201).json({ success: true, campaign, message: '✓ Campaña creada' });
  }

  return res.status(405).json({ error: 'Método no permitido' });
}
