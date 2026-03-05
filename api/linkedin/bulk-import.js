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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });

  if (req.method === 'POST') {
    const { leads, campaign_id } = req.body || {};

    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ error: 'No se proporcionaron leads' });
    }

    // Obtener o crear equipo
    let teamId;
    const { data: teams } = await supabaseAdmin
      .from('teams')
      .select('id')
      .eq('owner_id', userId)
      .limit(1);

    if (teams && teams.length > 0) {
      teamId = teams[0].id;
    } else {
      const { data: newTeam } = await supabaseAdmin
        .from('teams')
        .insert({ owner_id: userId, name: 'Mi Equipo' })
        .select()
        .single();
      teamId = newTeam?.id;
    }

    if (!teamId) return res.status(500).json({ error: 'No se pudo obtener el equipo' });

    // Preparar leads para inserción
    const leadsToInsert = leads.map((lead) => ({
      team_id: teamId,
      campaign_id: campaign_id || null,
      first_name: lead.first_name || lead.firstName || '',
      last_name: lead.last_name || lead.lastName || '',
      company: lead.company || '',
      job_title: lead.job_title || lead.jobTitle || lead.title || '',
      linkedin_url: lead.linkedin_url || lead.linkedinUrl || lead.url || '',
      email: lead.email || null,
      status: 'pending',
      sent_message: false,
    }));

    const { data: inserted, error } = await supabaseAdmin
      .from('leads')
      .insert(leadsToInsert)
      .select();

    if (error) return res.status(400).json({ error: error.message });

    // Actualizar contador de leads en la campaña si aplica
    if (campaign_id) {
      const { count } = await supabaseAdmin
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', campaign_id);

      await supabaseAdmin
        .from('campaigns')
        .update({ leads_count: count || 0 })
        .eq('id', campaign_id);
    }

    return res.status(201).json({
      success: true,
      imported: inserted?.length || 0,
      message: `✓ ${inserted?.length || 0} leads importados`,
    });
  }

  return res.status(405).json({ error: 'Método no permitido' });
}
