import { createClient } from '@supabase/supabase-js';
import { getAuthUser, setCors } from '../_lib/auth.js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

async function getOrCreateTeam(userId) {
  const { data: teams } = await supabaseAdmin
    .from('teams')
    .select('id')
    .eq('owner_id', userId)
    .limit(1);

  if (teams && teams.length > 0) return teams[0].id;

  const { data: newTeam } = await supabaseAdmin
    .from('teams')
    .insert({ owner_id: userId, name: 'Mi Equipo', description: 'Equipo principal' })
    .select()
    .single();

  return newTeam?.id || null;
}

export default async function handler(req, res) {
  // 1. CORS obligatorio siempre
  setCors(res);

  // 2. Manejar preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // 3. Autenticación centralizada
    const user = await getAuthUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Acceso Denegado. Token o API Key inválida.' });
    }
    const userId = user.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized: Missing User ID' });

    const teamId = await getOrCreateTeam(userId);
    if (!teamId) return res.status(403).json({ error: 'No team configured for this user' });

    const { id, action } = req.query;

    // ─── DETALLE DE CAMPAÑA ──────────────────────────────────────────────────
    if (id) {
      // Verificar que la campaña pertenece al equipo
      const { data: campaign, error: campError } = await supabaseAdmin
        .from('campaigns')
        .select('*')
        .eq('id', id)
        .eq('team_id', teamId)
        .single();

      if (campError || !campaign) return res.status(404).json({ error: 'Campaña no encontrada' });

      // GET ?id=xxx — detalle de campaña
      if (req.method === 'GET' && !action) {
        // Obtener leads de la campaña
        const { data: leads } = await supabaseAdmin
          .from('leads')
          .select('*')
          .eq('campaign_id', id)
          .eq('team_id', teamId)
          .order('created_at', { ascending: false });

        // Obtener estadísticas de la campaña
        const { data: activity } = await supabaseAdmin
          .from('campaign_activity')
          .select('action_type')
          .eq('campaign_id', id);

        const stats = {
          invitations: activity?.filter(a => a.action_type === 'invitation').length || 0,
          messages: activity?.filter(a => a.action_type === 'message' || a.action_type === 'message_reply').length || 0,
          accepted: leads?.filter(l => ['connected', 'contacted', 'replied'].includes(l.status)).length || 0,
          replied: leads?.filter(l => l.status === 'replied').length || 0,
          visits: 0
        };

        return res.status(200).json({
          success: true,
          campaign: {
            ...campaign,
            sequence: campaign.sequence || [],
            settings: campaign.settings || {},
            schedule: campaign.schedule || null,
            stats
          },
          leads: leads || [],
        });
      }

      // PUT ?id=xxx — actualizar campaña (nombre, estado, secuencia, opciones)
      if (req.method === 'PUT' && !action) {
        const updates = req.body || {};
        const allowed = ['name', 'description', 'status', 'sequence', 'settings', 'schedule', 'started_at', 'ended_at'];
        const filtered = {};
        for (const key of allowed) {
          if (key in updates) filtered[key] = updates[key];
        }
        filtered.updated_at = new Date().toISOString();

        // When activating a campaign, initialize all pending leads for the engine
        if (updates.status === 'active' && campaign.status !== 'active') {
          const startTiming = updates.start_timing || 'now';
          // For "now", set next_action_at to 1 min ago to ensure engine catches it immediately
          let baseTime = Date.now();
          let delayMs = 0;
          if (startTiming === '1h') delayMs = 60 * 60 * 1000;
          else if (startTiming === '1d') delayMs = 24 * 60 * 60 * 1000;
          else if (startTiming === '1w') delayMs = 7 * 24 * 60 * 60 * 1000;
          else if (startTiming === 'now') delayMs = -60 * 1000; // 1 min ago for safety

          const nextActionAt = new Date(baseTime + delayMs).toISOString();
          filtered.started_at = filtered.started_at || new Date().toISOString();

          // Set all leads to sequence_status='pending', next_action_at=nextActionAt
          await supabaseAdmin
            .from('leads')
            .update({
              sequence_status: 'pending',
              current_step: 0,
              next_action_at: nextActionAt,
            })
            .eq('campaign_id', id)
            .eq('sent_message', false);
          
          console.log(`[CAMPAIGNS] Campaign ${id} activated with timing "${startTiming}" — triggering engine...`);

          // AUTO-TRIGGER ENGINE (Fire and forget)
          const protocol = req.headers['x-forwarded-proto'] || 'https';
          const host = req.headers.host;
          const cronSecret = process.env.CRON_SECRET;
          if (host && cronSecret) {
            fetch(`${protocol}://${host}/api/linkedin/campaign-engine`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${cronSecret}` }
            }).catch(e => console.error('[CAMPAIGNS] Auto-trigger fail:', e.message));
          }
        }

        // When pausing, stop processing
        if (updates.status === 'paused' && campaign.status === 'active') {
          await supabaseAdmin
            .from('leads')
            .update({ next_action_at: null })
            .eq('campaign_id', id)
            .eq('sequence_status', 'active');
          console.log(`[CAMPAIGNS] Campaign ${id} paused — leads paused`);
        }

        // When resuming from paused, re-schedule active leads
        if (updates.status === 'active' && campaign.status === 'paused') {
          await supabaseAdmin
            .from('leads')
            .update({ next_action_at: new Date().toISOString() })
            .eq('campaign_id', id)
            .eq('sequence_status', 'active');
          console.log(`[CAMPAIGNS] Campaign ${id} resumed — leads re-scheduled`);
        }

        const { data: updated, error: updateError } = await supabaseAdmin
          .from('campaigns')
          .update(filtered)
          .eq('id', id)
          .select()
          .single();

        if (updateError) return res.status(400).json({ error: updateError.message });
        return res.status(200).json({ success: true, campaign: updated });
      }

      // DELETE ?id=xxx — eliminar campaña
      if (req.method === 'DELETE' && !action) {
        const { error: deleteError } = await supabaseAdmin
          .from('campaigns')
          .delete()
          .eq('id', id);

        if (deleteError) return res.status(400).json({ error: deleteError.message });
        return res.status(200).json({ success: true });
      }

      // GET ?id=xxx&action=leads — leads de la campaña
      if (req.method === 'GET' && action === 'leads') {
        const { search, status: statusFilter } = req.query;
        let query = supabaseAdmin
          .from('leads')
          .select('*')
          .eq('campaign_id', id)
          .eq('team_id', teamId)
          .order('created_at', { ascending: false });

        if (statusFilter) query = query.eq('status', statusFilter);
        if (search) {
          query = query.or(
            `first_name.ilike.%${search}%,last_name.ilike.%${search}%,company.ilike.%${search}%`
          );
        }

        const { data: leads, error: leadsError } = await query;
        if (leadsError) return res.status(400).json({ error: leadsError.message });
        return res.status(200).json({ success: true, leads: leads || [] });
      }

      // POST ?id=xxx&action=leads — añadir lead(s) a la campaña
      if (req.method === 'POST' && action === 'leads') {
        const { leadIds, lead } = req.body || {};

        if (leadIds && Array.isArray(leadIds)) {
          // Asignar leads existentes a esta campaña
          const { error: updateError } = await supabaseAdmin
            .from('leads')
            .update({ campaign_id: id })
            .in('id', leadIds)
            .eq('team_id', teamId);

          if (updateError) return res.status(400).json({ error: updateError.message });

          // Actualizar contador de leads
          const { count } = await supabaseAdmin
            .from('leads')
            .select('*', { count: 'exact', head: true })
            .eq('campaign_id', id);

          await supabaseAdmin
            .from('campaigns')
            .update({ leads_count: count || 0, updated_at: new Date().toISOString() })
            .eq('id', id);

          return res.status(200).json({ success: true, added: leadIds.length });
        }

        if (lead) {
          // Crear nuevo lead directamente en la campaña
          const { data: newLead, error: insertError } = await supabaseAdmin
            .from('leads')
            .insert({
              team_id: teamId,
              campaign_id: id,
              first_name: lead.first_name || '',
              last_name: lead.last_name || '',
              email: lead.email || '',
              company: lead.company || '',
              position: lead.position || '',
              linkedin_url: lead.linkedin_url || '',
              status: 'pending',
            })
            .select()
            .single();

          if (insertError) return res.status(400).json({ error: insertError.message });

          // Actualizar contador
          await supabaseAdmin.rpc('increment_leads_count', { campaign_id_param: id }).catch(() => {
            // Si la función RPC no existe, actualizar manualmente
            return supabaseAdmin
              .from('campaigns')
              .update({ leads_count: (campaign.leads_count || 0) + 1, updated_at: new Date().toISOString() })
              .eq('id', id);
          });

          return res.status(201).json({ success: true, lead: newLead });
        }

        return res.status(400).json({ error: 'Debes enviar leadIds o lead' });
      }

      // DELETE ?id=xxx&action=leads&leadId=yyy — quitar lead de campaña
      if (req.method === 'DELETE' && action === 'leads') {
        const { leadId } = req.query;
        if (!leadId) return res.status(400).json({ error: 'Falta leadId' });

        const { error: updateError } = await supabaseAdmin
          .from('leads')
          .update({ campaign_id: null })
          .eq('id', leadId)
          .eq('team_id', teamId);

        if (updateError) return res.status(400).json({ error: updateError.message });

        // Actualizar contador
        const { count } = await supabaseAdmin
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .eq('campaign_id', id);

        await supabaseAdmin
          .from('campaigns')
          .update({ leads_count: count || 0, updated_at: new Date().toISOString() })
          .eq('id', id);

        return res.status(200).json({ success: true });
      }
    }

    // ─── LISTA DE CAMPAÑAS ───────────────────────────────────────────────────

    // GET /api/linkedin/campaigns — listar campañas
    if (req.method === 'GET') {
      const { data: campaigns, error } = await supabaseAdmin
        .from('campaigns')
        .select('*')
        .eq('team_id', teamId)
        .order('created_at', { ascending: false });

      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ success: true, campaigns: campaigns || [] });
    }

    // POST /api/linkedin/campaigns — crear campaña
    if (req.method === 'POST') {
      const { name, description } = req.body || {};
      if (!name) return res.status(400).json({ error: 'Nombre de campaña requerido' });

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

  } catch (error) {
    console.error("[CRASH INTERNO EN ENDPOINT]:", error);
    return res.status(500).json({ error: error.message || 'Error interno del servidor' });
  }
}
