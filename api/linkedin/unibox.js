/**
 * /api/linkedin/unibox
 *
 * Endpoints:
 *  GET  ?action=chats&accountId=XXX&cursor=&limit=   → lista de conversaciones
 *  GET  ?action=messages&chatId=XXX&accountId=XXX    → mensajes de una conversación
 *  POST ?action=send                                 → { chatId, accountId, text }
 */

import { createClient } from '@supabase/supabase-js';
import { getAuthUser, setCors } from '../_lib/auth.js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);


async function getTeamId(userId) {
  const { data } = await supabaseAdmin
    .from('teams')
    .select('id')
    .eq('owner_id', userId)
    .limit(1);
  return data?.[0]?.id || null;
}

function unipileHeaders() {
  return {
    'X-API-KEY': (process.env.UNIPILE_API_KEY || '').trim(),
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };
}

function unipileBase() {
  return `https://${(process.env.UNIPILE_DSN || '').trim()}`;
}

const ANALYSIS_PROMPT =
  "Analiza el sentimiento de esta conversación de ventas en LinkedIn. " +
  "Responde ÚNICAMENTE con una palabra: " +
  "'hot' (si quiere agendar o pide info), " +
  "'warm' (si responde pero tiene dudas) o " +
  "'cold' (si no responde o no le interesa).\n\nConversación:\n{MESSAGES}";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function handler(req, res) {
  // 1. CORS obligatorio siempre
  setCors(res);

  // 2. Manejar preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const action = req.query.action;

    // ─── CRON: batch temperature analysis (CRON_SECRET auth, no user session) ──
    if (req.method === 'GET' && action === 'cron_analyze') {
      const cronSecret = process.env.CRON_SECRET;
      if (cronSecret) {
        const bearer = (req.headers.authorization || '').replace('Bearer ', '');
        const cronHeader = req.headers['x-cron-secret'] || '';
        if (bearer !== cronSecret && cronHeader !== cronSecret) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
      }

      const anthropicKey = (process.env.ANTHROPIC_API_KEY || '').trim();
      if (!anthropicKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

      const cronDsn = (process.env.UNIPILE_DSN || '').trim();
      const cronApiKey = (process.env.UNIPILE_API_KEY || '').trim();
      if (!cronDsn || !cronApiKey) return res.status(500).json({ error: 'Unipile not configured' });

      const nineHoursAgo = new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString();
      let totalProcessed = 0;
      let totalErrors = 0;

      const { data: accounts, error: accErr } = await supabaseAdmin
        .from('linkedin_accounts')
        .select('id, team_id, unipile_account_id')
        .eq('is_valid', true)
        .not('unipile_account_id', 'is', null);

      if (accErr) return res.status(500).json({ error: accErr.message });
      if (!accounts || accounts.length === 0) {
        return res.status(200).json({ processed: 0, message: 'No valid accounts found' });
      }

      const { data: leadsToAnalyse } = await supabaseAdmin
        .from('leads')
        .select('id, team_id, unipile_id, last_analysis_at')
        .not('unipile_id', 'is', null)
        .or(`last_analysis_at.is.null,last_analysis_at.lt.${nineHoursAgo}`);

      if (!leadsToAnalyse || leadsToAnalyse.length === 0) {
        return res.status(200).json({ processed: 0, message: 'All leads are up-to-date' });
      }

      const leadByProvider = new Map(
        leadsToAnalyse.map((l) => [l.unipile_id.toLowerCase(), l])
      );
      const accountByTeam = new Map();
      for (const acc of accounts) {
        if (!accountByTeam.has(acc.team_id)) accountByTeam.set(acc.team_id, acc);
      }

      for (const [, acc] of accountByTeam.entries()) {
        try {
          const chatsRes = await fetch(
            `${unipileBase()}/api/v1/chats?account_id=${acc.unipile_account_id}&limit=30`,
            { headers: unipileHeaders() }
          );
          if (!chatsRes.ok) continue;
          const chatsData = await chatsRes.json();
          const chatItems = chatsData.items || chatsData.chats || [];

          const BATCH = 5;
          for (let i = 0; i < chatItems.length; i += BATCH) {
            const batch = chatItems.slice(i, i + BATCH);
            await Promise.all(batch.map(async (chat) => {
              try {
                const attRes = await fetch(
                  `${unipileBase()}/api/v1/chats/${chat.id}/attendees`,
                  { headers: unipileHeaders() }
                );
                if (!attRes.ok) return;
                const attData = await attRes.json();
                const attendees = attData.items || attData.attendees || attData || [];
                const other = attendees.find((a) => !a.is_self) || attendees[0];
                if (!other) return;
                const providerId = (other.provider_id || other.id || '').toLowerCase();
                if (!providerId) return;
                const lead = leadByProvider.get(providerId);
                if (!lead) return;

                const msgsRes = await fetch(
                  `${unipileBase()}/api/v1/chats/${chat.id}/messages?limit=10`,
                  { headers: unipileHeaders() }
                );
                if (!msgsRes.ok) return;
                const msgsData = await msgsRes.json();
                const messages = (msgsData.items || msgsData.messages || []).reverse();
                if (messages.length === 0) return;

                const conversationText = messages.map((m) => {
                  const dir = String(m.is_sender) === 'true' || m.is_sender === 1 ? 'Yo' : 'Contacto';
                  return `${dir}: ${(m.text || '[adjunto]').substring(0, 200)}`;
                }).join('\n');

                const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': anthropicKey,
                    'anthropic-version': '2023-06-01',
                  },
                  body: JSON.stringify({
                    model: 'claude-3-haiku-20240307',
                    max_tokens: 5,
                    messages: [{ role: 'user', content: ANALYSIS_PROMPT.replace('{MESSAGES}', conversationText) }],
                  }),
                });
                if (!aiRes.ok) return;
                const aiData = await aiRes.json();
                const rawTemp = (aiData.content?.[0]?.text || '').trim().toLowerCase();
                const temperature = ['hot', 'warm', 'cold'].includes(rawTemp) ? rawTemp : 'cold';

                await supabaseAdmin.from('leads').update({
                  conversation_temperature: temperature,
                  last_analysis_at: new Date().toISOString(),
                }).eq('id', lead.id);

                totalProcessed++;
              } catch (e) {
                console.error(`[CRON][temperature] chat ${chat.id}:`, e.message);
                totalErrors++;
              }
            }));
            if (i + BATCH < chatItems.length) await sleep(500);
          }
        } catch (e) {
          console.error(`[CRON][temperature] account ${acc.unipile_account_id}:`, e.message);
          totalErrors++;
        }
      }

      return res.status(200).json({
        processed: totalProcessed,
        errors: totalErrors,
        leads_eligible: leadsToAnalyse.length,
      });
    }

    // 3. Autenticación centralizada
    const user = await getAuthUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Acceso Denegado. Token o API Key inválida.' });
    }
    const userId = user.userId;

    const teamId = await getTeamId(userId);
    if (!teamId) return res.status(403).json({ error: 'Equipo no encontrado' });

    const dsn = (process.env.UNIPILE_DSN || '').trim();
    const apiKey = (process.env.UNIPILE_API_KEY || '').trim();

    if (!dsn || !apiKey) {
      return res.status(500).json({ error: 'Unipile no configurado' });
    }

    // ─── GET chats (enriched with attendee names + pictures) ────────────
    if (req.method === 'GET' && action === 'chats') {
      const { accountId, cursor, limit = '20' } = req.query;

      // Verify the account belongs to this team
      if (accountId) {
        const { data: acc } = await supabaseAdmin
          .from('linkedin_accounts')
          .select('id, unipile_account_id')
          .eq('team_id', teamId)
          .eq('unipile_account_id', accountId)
          .single();
        if (!acc) return res.status(403).json({ error: 'Cuenta no autorizada' });
      }

      const params = new URLSearchParams({ limit });
      if (accountId) params.set('account_id', accountId);
      if (cursor) params.set('cursor', cursor);

      const r = await fetch(`${unipileBase()}/api/v1/chats?${params}`, {
        headers: unipileHeaders(),
      });
      if (!r.ok) {
        const err = await r.text();
        console.error('[UNIBOX][chats]', r.status, err);
        return res.status(r.status).json({ error: 'Error obteniendo conversaciones' });
      }
      const data = await r.json();
      const chatItems = data.items || data.chats || [];

      // ── Fetch blocked leads to use as filter ──────────────────────────
      const { data: blockedLeads } = await supabaseAdmin
        .from('leads')
        .select('linkedin_url, unipile_id')
        .eq('team_id', teamId)
        .eq('status', 'blocked');

      // Build two sets: one for public slugs from URL, one for raw provider IDs
      const blockedSlugs = new Set(
        (blockedLeads || []).flatMap(l => {
          if (!l.linkedin_url) return [];
          const match = l.linkedin_url.match(/linkedin\.com\/in\/([^/?]+)/i);
          return match ? [match[1].toLowerCase()] : [];
        })
      );
      const blockedProviderIds = new Set(
        (blockedLeads || []).map(l => l.unipile_id).filter(Boolean).map(id => id.toLowerCase())
      );

      // ── Enrich each chat with attendee names + picture_url ──
      const enriched = await Promise.all(chatItems.map(async (chat) => {
        try {
          const attRes = await fetch(
            `${unipileBase()}/api/v1/chats/${chat.id}/attendees`,
            { headers: unipileHeaders() }
          );
          if (attRes.ok) {
            const attData = await attRes.json();
            const attendeeList = attData.items || attData.attendees || attData || [];
            if (Array.isArray(attendeeList) && attendeeList.length > 0) {
              chat.attendees_enriched = attendeeList.map(a => ({
                id: a.id,
                provider_id: a.provider_id,
                public_identifier: a.public_identifier || a.username || null,
                name: a.name || a.display_name || null,
                picture_url: a.picture_url || a.avatar_url || null,
                is_self: a.is_self || false,
              }));
            }
          }
        } catch (err) {
          console.error(`[UNIBOX][enrich] Error fetching attendees for chat ${chat.id}:`, err.message);
        }
        return chat;
      }));

      // ── Filter out chats whose lead is blocked ─────────────────────
      const filtered = enriched.filter(chat => {
        const attendees = chat.attendees_enriched || [];
        const nonSelf = attendees.filter(a => !a.is_self);
        return !nonSelf.some(a => {
          const slug = a.public_identifier ? a.public_identifier.toLowerCase() : null;
          const pid = a.provider_id ? a.provider_id.toLowerCase() : null;
          return (slug && blockedSlugs.has(slug)) || (pid && blockedProviderIds.has(pid));
        });
      });

      // Return with enriched attendees (blocked leads excluded)
      return res.status(200).json({ ...data, items: filtered });
    }

    // ─── GET messages ─────────────────────────────────────────────────
    if (req.method === 'GET' && action === 'messages') {
      const { chatId, cursor, limit = '50' } = req.query;
      if (!chatId) return res.status(400).json({ error: 'Falta chatId' });

      const params = new URLSearchParams({ limit });
      if (cursor) params.set('cursor', cursor);

      const r = await fetch(`${unipileBase()}/api/v1/chats/${chatId}/messages?${params}`, {
        headers: unipileHeaders(),
      });
      if (!r.ok) {
        const err = await r.text();
        console.error('[UNIBOX][messages]', r.status, err);
        return res.status(r.status).json({ error: 'Error obteniendo mensajes' });
      }
      const data = await r.json();
      return res.status(200).json(data);
    }

    // ─── POST mark as read ────────────────────────────────────────────
    if (req.method === 'POST' && action === 'mark_read') {
      const { chatId, accountId } = req.body;
      if (!chatId) return res.status(400).json({ error: 'Falta chatId' });

      // Verify account ownership
      if (accountId) {
        const { data: acc } = await supabaseAdmin
          .from('linkedin_accounts')
          .select('id')
          .eq('team_id', teamId)
          .eq('unipile_account_id', accountId)
          .single();
        if (!acc) return res.status(403).json({ error: 'Cuenta no autorizada' });
      }

      // Try multiple Unipile methods to mark chat as read
      // Method 1: PATCH /api/v1/chats/:id
      let success = false;
      try {
        const r1 = await fetch(`${unipileBase()}/api/v1/chats/${chatId}`, {
          method: 'PATCH',
          headers: unipileHeaders(),
          body: JSON.stringify({ unread_count: 0 }),
        });
        if (r1.ok) success = true;
      } catch {}

      // Method 2: PUT /api/v1/chats/:id
      if (!success) {
        try {
          const r2 = await fetch(`${unipileBase()}/api/v1/chats/${chatId}`, {
            method: 'PUT',
            headers: unipileHeaders(),
            body: JSON.stringify({ unread_count: 0 }),
          });
          if (r2.ok) success = true;
        } catch {}
      }

      // Method 3: POST /api/v1/chats/:id/messages/read
      if (!success) {
        try {
          await fetch(`${unipileBase()}/api/v1/chats/${chatId}/messages/read`, {
            method: 'POST',
            headers: unipileHeaders(),
          });
        } catch {}
      }

      return res.status(200).json({ success: true });
    }

    // ─── POST send message ────────────────────────────────────────────
    if (req.method === 'POST' && action === 'send') {
      const { chatId, text, accountId } = req.body;
      if (!chatId || !text) return res.status(400).json({ error: 'Faltan chatId o text' });

      // Verify account ownership
      if (accountId) {
        const { data: acc } = await supabaseAdmin
          .from('linkedin_accounts')
          .select('id')
          .eq('team_id', teamId)
          .eq('unipile_account_id', accountId)
          .single();
        if (!acc) return res.status(403).json({ error: 'Cuenta no autorizada' });
      }

      const r = await fetch(`${unipileBase()}/api/v1/chats/${chatId}/messages`, {
        method: 'POST',
        headers: unipileHeaders(),
        body: JSON.stringify({ text }),
      });
      if (!r.ok) {
        const err = await r.text();
        console.error('[UNIBOX][send]', r.status, err);
        return res.status(r.status).json({ error: 'Error enviando mensaje' });
      }
      const data = await r.json();
      return res.status(200).json(data);
    }

    // ─── POST upsert_lead — find or create a lead from Unibox ─────────
    if (req.method === 'POST' && action === 'upsert_lead') {
      const { providerId, name, publicIdentifier } = req.body;
      if (!providerId) return res.status(400).json({ error: 'Falta providerId' });

      // Split full name into first_name / last_name
      const nameParts = (name || '').trim().split(/\s+/);
      const firstName = nameParts[0] || 'Desconocido';
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;

      // Build profile URL if we have the public identifier
      const profileUrl = publicIdentifier
        ? `https://www.linkedin.com/in/${publicIdentifier}/`
        : null;

      // Search by URL first (most reliable), then by provider_id as fallback
      let existingLead = null;
      if (profileUrl) {
        const { data } = await supabaseAdmin
          .from('leads')
          .select('id, tags, sequence_paused, first_name, last_name, linkedin_url, status, conversation_temperature, last_analysis_at')
          .ilike('linkedin_url', `%${publicIdentifier}%`)
          .eq('team_id', teamId)
          .limit(1);
        existingLead = data?.[0] || null;
      }
      if (!existingLead) {
        const { data } = await supabaseAdmin
          .from('leads')
          .select('id, tags, sequence_paused, first_name, last_name, linkedin_url, status, conversation_temperature, last_analysis_at')
          .ilike('linkedin_url', `%${providerId}%`)
          .eq('team_id', teamId)
          .limit(1);
        existingLead = data?.[0] || null;
      }

      if (existingLead) {
        return res.status(200).json({ lead: existingLead, created: false });
      }

      // Create a minimal orphan lead
      let insertData = {
        team_id: teamId,
        campaign_id: null,
        first_name: firstName,
        last_name: lastName,
        linkedin_url: profileUrl || `https://www.linkedin.com/in/${providerId}/`,
        status: 'pending',
        tags: [],
        sequence_paused: false,
      };

      let { data: newLead, error } = await supabaseAdmin
        .from('leads')
        .insert({ ...insertData, unipile_id: providerId })
        .select('id, tags, sequence_paused, first_name, last_name, linkedin_url, status, conversation_temperature, last_analysis_at')
        .single();

      if (error && error.message && error.message.includes('unipile_id')) {
        ({ data: newLead, error } = await supabaseAdmin
          .from('leads')
          .insert(insertData)
          .select('id, tags, sequence_paused, first_name, last_name, linkedin_url, status, conversation_temperature, last_analysis_at')
          .single());
      }

      if (error) {
        console.error('[UNIBOX][upsert_lead]', error.message);
        return res.status(200).json({ lead: null, created: false, error: error.message });
      }
      return res.status(200).json({ lead: newLead, created: true });
    }

    // ─── POST block — DB block + best-effort Unipile LinkedIn block ──────────
    if (req.method === 'POST' && action === 'block') {
      const { leadId, unipile_id, accountId } = req.body;

      if (!leadId && !unipile_id) {
        return res.status(400).json({ error: 'Falta leadId o unipile_id' });
      }

      if (leadId) {
        const { data: lead, error } = await supabaseAdmin
          .from('leads')
          .update({ status: 'blocked' })
          .eq('id', leadId)
          .eq('team_id', teamId)
          .select('id, status')
          .single();

        if (!error && lead) {
          if (unipile_id) {
            supabaseAdmin.from('leads').update({ unipile_id }).eq('id', leadId).eq('team_id', teamId)
              .then(() => {}).catch(() => {});
          }
          if (unipile_id && accountId) {
            const blockUrl = `${unipileBase()}/api/v1/accounts/${unipile_id}/block?account_id=${accountId}`;
            fetch(blockUrl, {
              method: 'POST',
              headers: unipileHeaders(),
              body: JSON.stringify({ account_id: accountId }),
            }).catch(() => {});
          }
          return res.status(200).json({ success: true, lead });
        }
      }

      if (unipile_id) {
        const { data: lead, error } = await supabaseAdmin
          .from('leads')
          .update({ status: 'blocked' })
          .eq('unipile_id', unipile_id)
          .eq('team_id', teamId)
          .select('id, status')
          .single();

        if (!error && lead) {
          return res.status(200).json({ success: true, lead });
        }

        const { data: leads } = await supabaseAdmin
          .from('leads')
          .select('id')
          .eq('team_id', teamId)
          .ilike('linkedin_url', `%${unipile_id}%`)
          .limit(1);

        if (leads && leads.length > 0) {
          const { data: updatedLead, error: updateErr } = await supabaseAdmin
            .from('leads')
            .update({ status: 'blocked' })
            .eq('id', leads[0].id)
            .eq('team_id', teamId)
            .select('id, status')
            .single();

          if (!updateErr && updatedLead) {
            return res.status(200).json({ success: true, lead: updatedLead });
          }
        }
      }

      return res.status(200).json({ success: true, message: 'No matching lead found in DB' });
    }

    // ─── GET blocked_leads ──────────────────────────────────────────────
    if (req.method === 'GET' && action === 'blocked_leads') {
      const { data: blockedLeads, error } = await supabaseAdmin
        .from('leads')
        .select('id, first_name, last_name, linkedin_url, company, status, tags')
        .eq('team_id', teamId)
        .eq('status', 'blocked')
        .order('first_name', { ascending: true });

      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ leads: blockedLeads || [] });
    }

    // ─── GET lead data by provider_id (attendee) ─────────────────────
    if (req.method === 'GET' && action === 'get_lead') {
      const { providerId } = req.query;
      if (!providerId) return res.status(400).json({ error: 'Falta providerId' });

      const { data: leads } = await supabaseAdmin
        .from('leads')
        .select('id, tags, sequence_paused, first_name, last_name, linkedin_url, conversation_temperature, last_analysis_at')
        .ilike('linkedin_url', `%${providerId}%`)
        .limit(1);

      if (!leads || leads.length === 0) {
        return res.status(200).json({ lead: null });
      }
      return res.status(200).json({ lead: leads[0] });
    }

    // ─── PATCH update lead (tags / sequence_paused / status) ─────────
    if (req.method === 'PATCH' && action === 'update_lead') {
      const { leadId, tags, sequence_paused, status, conversation_temperature } = req.body;
      if (!leadId) return res.status(400).json({ error: 'Falta leadId' });

      const updates = {};
      if (tags !== undefined) updates.tags = tags;
      if (sequence_paused !== undefined) updates.sequence_paused = sequence_paused;
      if (status !== undefined) updates.status = status;
      if (conversation_temperature !== undefined) updates.conversation_temperature = conversation_temperature;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No hay campos para actualizar' });
      }

      const { data: lead, error } = await supabaseAdmin
        .from('leads')
        .update(updates)
        .eq('id', leadId)
        .eq('team_id', teamId)
        .select('id, tags, sequence_paused, status, conversation_temperature, last_analysis_at')
        .single();

      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ lead });
    }

    // ─── POST analyze_temperature — AI analysis of conversation heat ──────
    if (req.method === 'POST' && action === 'analyze_temperature') {
      const { leadId, messages: convMessages } = req.body;
      if (!leadId) return res.status(400).json({ error: 'Falta leadId' });
      if (!Array.isArray(convMessages) || convMessages.length === 0) {
        return res.status(400).json({ error: 'Falta lista de messages' });
      }

      // Verify the lead belongs to this team
      const { data: lead, error: leadErr } = await supabaseAdmin
        .from('leads')
        .select('id, conversation_temperature')
        .eq('id', leadId)
        .eq('team_id', teamId)
        .single();
      if (leadErr || !lead) return res.status(404).json({ error: 'Lead no encontrado' });

      const anthropicKey = (process.env.ANTHROPIC_API_KEY || '').trim();
      if (!anthropicKey) return res.status(500).json({ error: 'IA no configurada (ANTHROPIC_API_KEY)' });

      // Build a concise conversation summary (last 20 messages)
      const conversationText = convMessages.slice(-20).map(m => {
        const dir = (String(m.is_sender) === 'true' || m.is_sender === 1) ? 'Yo' : 'Contacto';
        return `${dir}: ${(m.text || '[adjunto]').substring(0, 300)}`;
      }).join('\n');

      const prompt = `Analiza el sentimiento de esta conversación de ventas en LinkedIn.\nResponde ÚNICAMENTE con una palabra: 'hot' (si quiere agendar o pide info), 'warm' (si responde pero tiene dudas) o 'cold' (si no responde o no le interesa).\n\nConversación (más reciente al final):\n${conversationText}`;

      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 5,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!aiRes.ok) {
        const errText = await aiRes.text();
        console.error('[UNIBOX][analyze_temperature] Anthropic error:', aiRes.status, errText);
        return res.status(502).json({ error: 'Error al analizar conversación con IA' });
      }

      const aiData = await aiRes.json();
      const rawTemp = (aiData.content?.[0]?.text || '').trim().toLowerCase();
      const temperature = ['hot', 'warm', 'cold'].includes(rawTemp) ? rawTemp : 'cold';

      const { data: updated, error: updateErr } = await supabaseAdmin
        .from('leads')
        .update({ conversation_temperature: temperature, last_analysis_at: new Date().toISOString() })
        .eq('id', leadId)
        .eq('team_id', teamId)
        .select('id, conversation_temperature, last_analysis_at')
        .single();

      if (updateErr) return res.status(500).json({ error: updateErr.message });
      return res.status(200).json({ temperature, lead: updated });
    }

    return res.status(405).json({ error: 'Método no permitido' });

  } catch (error) {
    console.error("[CRASH INTERNO EN ENDPOINT]:", error);
    return res.status(500).json({ error: error.message || 'Error interno del servidor' });
  }
}
