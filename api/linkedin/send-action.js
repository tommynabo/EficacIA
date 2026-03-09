/**
 * /api/linkedin/send-action
 *
 * Actually sends a LinkedIn invitation or message via Unipile.
 *
 * POST body:
 *   { leadId, accountId, actionType: 'invitation'|'message', content, campaignId? }
 *
 * Also used internally by the campaign engine.
 */
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
    return jwt.verify(token, process.env.JWT_SECRET || 'dev-secret').userId;
  } catch { return null; }
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

/**
 * Resolve a lead's variables in a message template.
 * Replaces {{nombre}}, {{empresa}}, {{cargo}} etc.
 */
function resolveTemplate(template, lead) {
  const vars = {
    nombre: lead.first_name || '',
    apellido: lead.last_name || '',
    empresa: lead.company || '',
    cargo: lead.job_title || lead.position || '',
    email: lead.email || '',
    linkedin_url: lead.linkedin_url || '',
    nombre_completo: `${lead.first_name || ''} ${lead.last_name || ''}`.trim(),
    ...(lead.custom_vars || {}),
  };
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || '');
}

/**
 * Generate AI message using Claude if useAI is true.
 */
async function generateAIMessage(lead, baseContent, campaignName) {
  if (!process.env.ANTHROPIC_API_KEY) return resolveTemplate(baseContent, lead);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 250,
        messages: [{
          role: 'user',
          content: `Reescribe este mensaje de LinkedIn de forma natural y personalizada (máx 280 chars para invitación, 500 para mensaje). 
Contexto: ${lead.first_name} ${lead.last_name}, ${lead.job_title || lead.position || 'profesional'} en ${lead.company || 'su empresa'}. Campaña: ${campaignName || 'outreach'}.
Mensaje base: "${baseContent}"
Solo devuelve el mensaje final, sin comillas ni explicaciones.`,
        }],
      }),
    });
    const data = await res.json();
    return data?.content?.[0]?.text || resolveTemplate(baseContent, lead);
  } catch {
    return resolveTemplate(baseContent, lead);
  }
}

/**
 * Extract LinkedIn identifier from a profile URL.
 * Unipile needs the provider_id (vanity name or urn).
 */
function extractLinkedInId(url) {
  if (!url) return null;
  // linkedin.com/in/john-doe → john-doe
  const m = url.match(/linkedin\.com\/in\/([^/?#]+)/);
  return m ? m[1] : null;
}

/**
 * Send a connection invitation via Unipile.
 * POST /api/v1/users/invite
 */
async function sendInvitation(unipileAccountId, linkedinId, message) {
  const body = {
    provider: 'LINKEDIN',
    account_id: unipileAccountId,
    recipient_identifier: linkedinId,
    message: (message || '').slice(0, 280), // LinkedIn limit
  };
  console.log('[SEND-ACTION] Sending invitation to:', linkedinId);
  const res = await fetch(`${unipileBase()}/api/v1/users/invite`, {
    method: 'POST',
    headers: unipileHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('[SEND-ACTION] Invitation error:', res.status, err);
    throw new Error(`Invitation failed (${res.status}): ${err.slice(0, 200)}`);
  }
  return await res.json();
}

/**
 * Send a direct message via Unipile.
 * POST /api/v1/chats/new — starts a new conversation
 * Falls back to existing chat if one exists.
 */
async function sendMessage(unipileAccountId, linkedinId, message) {
  console.log('[SEND-ACTION] Sending message to:', linkedinId);
  // Try to send via new chat endpoint
  const body = {
    account_id: unipileAccountId,
    attendees_ids: [linkedinId],
    text: message,
  };
  const res = await fetch(`${unipileBase()}/api/v1/chats`, {
    method: 'POST',
    headers: unipileHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('[SEND-ACTION] Message error:', res.status, err);
    throw new Error(`Message failed (${res.status}): ${err.slice(0, 200)}`);
  }
  return await res.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  // Auth: either JWT user or internal engine key
  const internalKey = req.headers['x-engine-key'];
  const isInternal = internalKey && internalKey === (process.env.JWT_SECRET || 'dev-secret');
  const userId = isInternal ? 'engine' : getUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });

  const { leadId, accountId, actionType, content, useAI, campaignId, campaignName } = req.body || {};
  if (!leadId || !accountId || !actionType) {
    return res.status(400).json({ error: 'Faltan leadId, accountId o actionType' });
  }

  try {
    // Fetch the lead
    const { data: lead, error: leadErr } = await supabaseAdmin
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();
    if (leadErr || !lead) return res.status(404).json({ error: 'Lead no encontrado' });

    // Fetch the LinkedIn account to get unipile_account_id
    const { data: account, error: accErr } = await supabaseAdmin
      .from('linkedin_accounts')
      .select('id, unipile_account_id, profile_name')
      .eq('id', accountId)
      .single();
    if (accErr || !account || !account.unipile_account_id) {
      return res.status(400).json({ error: 'Cuenta de LinkedIn no encontrada o no conectada vía Unipile' });
    }

    const linkedinId = extractLinkedInId(lead.linkedin_url);
    if (!linkedinId) {
      return res.status(400).json({ error: 'El lead no tiene URL de LinkedIn válida' });
    }

    // Resolve message content
    let finalMessage = content || '';
    if (useAI) {
      finalMessage = await generateAIMessage(lead, finalMessage, campaignName);
    } else {
      finalMessage = resolveTemplate(finalMessage, lead);
    }

    // Execute the action
    let result;
    if (actionType === 'invitation') {
      result = await sendInvitation(account.unipile_account_id, linkedinId, finalMessage);
    } else if (actionType === 'message') {
      result = await sendMessage(account.unipile_account_id, linkedinId, finalMessage);
    } else {
      return res.status(400).json({ error: `Tipo de acción no soportado: ${actionType}` });
    }

    // Update lead in DB
    await supabaseAdmin.from('leads').update({
      status: actionType === 'invitation' ? 'invited' : 'contacted',
      sent_message: true,
      sent_at: new Date().toISOString(),
      ai_message: finalMessage,
      last_action_at: new Date().toISOString(),
    }).eq('id', leadId);

    // Log the action
    if (campaignId) {
      await supabaseAdmin.from('campaign_activity').insert({
        campaign_id: campaignId,
        lead_id: leadId,
        action_type: actionType,
        action_details: {
          message: finalMessage,
          account_id: accountId,
          unipile_response: result,
        },
      }).catch(() => { /* campaign_activity table may not exist yet */ });
    }

    console.log(`[SEND-ACTION] ✓ ${actionType} sent to ${linkedinId} via ${account.profile_name}`);
    return res.status(200).json({
      success: true,
      action: actionType,
      message_sent: finalMessage,
      message: `✓ ${actionType === 'invitation' ? 'Invitación enviada' : 'Mensaje enviado'} a ${lead.first_name}`,
    });
  } catch (err) {
    console.error('[SEND-ACTION] Error:', err.message);
    // Update lead with error
    await supabaseAdmin.from('leads').update({
      sequence_status: 'failed',
    }).eq('id', leadId).catch(() => {});
    return res.status(500).json({ error: err.message });
  }
}
