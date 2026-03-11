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

const ACTOR_PROFILE_SCRAPER = 'supreme_coder~linkedin-profile-scraper';

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

// --- Apify helpers ---
async function startApifyRun(actorSlug, input) {
  const token = (process.env.APIFY_API_TOKEN || '').trim();
  if (!token) throw new Error('APIFY_API_TOKEN no configurado en Vercel.');
  const url = `https://api.apify.com/v2/acts/${actorSlug}/runs?token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 404) {
      console.error(`[APIFY] El actor '${actorSlug}' no existe o no tienes acceso. Prueba a usar otro actor en send-action.js o suscribirte en Apify.`);
    }
    throw new Error(`Error al iniciar Apify (${res.status}): ${errText.substring(0, 100)}`);
  }
  const data = await res.json();
  return { runId: data.data.id, datasetId: data.data.defaultDatasetId };
}

async function checkApifyRun(runId) {
  const token = (process.env.APIFY_API_TOKEN || '').trim();
  const res = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${encodeURIComponent(token)}`);
  if (!res.ok) throw new Error(`Error al verificar Apify (${res.status})`);
  const data = await res.json();
  return data.data; // { status, defaultDatasetId }
}

async function fetchApifyDataset(datasetId) {
  const token = (process.env.APIFY_API_TOKEN || '').trim();
  const res = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${encodeURIComponent(token)}&format=json`);
  if (!res.ok) throw new Error(`Error dataset Apify (${res.status})`);
  return await res.json();
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
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const val = vars[key];
    return (val && val.trim() !== '') ? val : match;
  });
}

/**
 * Generate advanced AI variables (comentario_post, etc) using Claude and scraped profile data.
 * The output string will replace the {{vars}} inside the template directly.
 */
async function generateAdvancedAIVariables(template, lead, aiPrompt, actionType) {
  // Check if there are ANY unresolved tags left in the template
  const unresolvedTags = template.match(/\{\{(\w+)\}\}/g);
  if (!process.env.ANTHROPIC_API_KEY || !unresolvedTags || unresolvedTags.length === 0) {
    return template;
  }
  const scraped = lead.custom_vars?.scraped_profile;
  if (!scraped) return template; // Should have been caught before

  // Give Claude a condensed version of the profile to save tokens
  const condensedProfile = {
    about: scraped.about || scraped.summary || '',
    headline: scraped.headline || scraped.position || '',
    experience: (scraped.experience || []).slice(0, 3).map(e => `${e.title} at ${e.company} (${e.duration})`),
    recent_posts: (scraped.posts || scraped.certifications || []).slice(0, 3).map(p => p.text || p.title || ''),
  };

  // Calculate constraint for invitations
  let lengthConstraint = "Sé conciso. Escribe 1 o 2 oraciones breves.";
  if (actionType === 'invitation') {
    const templateLen = template.replace(/\{\{(.*?)\}\}/g, '').length;
    const charsRemaining = 200 - templateLen;
    lengthConstraint = `CRÍTICO: El límite absoluto para el texto generado es de ${Math.max(10, charsRemaining)} caracteres, de lo contrario la invitación rebotará. Mantenlo muy corto (1 oración).`;
  }

  // Extract clean variable names for the prompt
  const requestedVars = unresolvedTags.map(v => v.replace(/[{}]/g, '')).join(', ');

  const sysPrompt = `Eres un experto en cold outreach B2B. Eres humano, breve y directo.
Tu tarea es generar el reemplazo exacto para TODAS las variables dinámicas solicitadas basándote en el perfil del lead.
Algunas de estas variables pueden ser faltantes como "empresa" o "cargo", infiérelas de su perfil si existen.
Si te piden "comentario_post", inventa un elogio breve a una de sus publicaciones recientes.
Manten un tono profesional pero muy coloquial. No uses saludos, comillas ni formatos raros.
${lengthConstraint}

Input:
Perfil del lead: ${JSON.stringify(condensedProfile)}
Variables solicitadas: ${requestedVars}
Prompt de IA extra (si aplica): "${aiPrompt || 'Sé creativo y breve elogio.'}"`;

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
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `${sysPrompt}\n\nDevuelve la respuesta en formato JSON exacto: {"variable_name": "texto generado sin comillas"}. Por ejemplo si piden {{comentario_post}} -> {"comentario_post": "vi tu post sobre IA..."}`,
        }],
      }),
    });
    const data = await res.json();
    const textResp = data?.content?.[0]?.text || '{}';
    // try to parse JSON
    const match = textResp.match(/\{[\s\S]*\}/);
    if (!match) return template;
    const rawVarsMap = JSON.parse(match[0]);
    console.log('[SEND-ACTION] Raw Claude variables:', rawVarsMap);

    // Sanitize keys (remove any accidental braces Claude might have added)
    const varsMap = {};
    for (const [k, v] of Object.entries(rawVarsMap)) {
      const cleanKey = k.replace(/[{}]/g, '').trim();
      varsMap[cleanKey] = v;
    }
    console.log('[SEND-ACTION] Cleaned variables:', varsMap);

    // Replace in template
    let newTemplate = template;
    for (const [k, v] of Object.entries(varsMap)) {
      if (k && v) {
        newTemplate = newTemplate.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
      }
    }
    return newTemplate;
  } catch (err) {
    console.error('[SEND-ACTION] Advanced AI Gen Error:', err.message);
    return template;
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
 * Resolve a LinkedIn identifier (username/vanity name) to a Unipile provider_id
 * GET /api/v1/users/{identifier}
 */
async function getUnipileProviderId(unipileAccountId, linkedinId) {
  const res = await fetch(`${unipileBase()}/api/v1/users/${linkedinId}?account_id=${unipileAccountId}`, {
    method: 'GET',
    headers: unipileHeaders(),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('[SEND-ACTION] Failed to resolve Unipile provider_id:', res.status, err);
    throw new Error(`Failed to resolve profile (${res.status}): ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.provider_id;
}

/**
 * Send a connection invitation via Unipile.
 * POST /api/v1/users/invite
 */
async function sendInvitation(unipileAccountId, linkedinId, message) {
  const providerId = await getUnipileProviderId(unipileAccountId, linkedinId);
  const body = {
    provider_id: providerId,
    account_id: unipileAccountId,
  };

  const finalMsg = (message || '').trim().slice(0, 200); // Safest limit for all LinkedIn accounts
  if (finalMsg) {
    body.message = finalMsg;
  }

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

  const { leadId, accountId, actionType, content, campaignId, campaignName, simulate } = req.body || {};
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

    // Step 1: Resolve standard variables ({{nombre}}, {{empresa}}) FIRST
    // This provides Claude with more context if needed, and ensures early returns (e.g. Apify 202) don't send raw braces
    finalMessage = resolveTemplate(finalMessage, lead);

    // Step 2: Extract ANY remaining unresolved tags. If there are none, we skip Apify.
    const remainingTags = finalMessage.match(/\{\{(\w+)\}\}/g);
    const needsAdvancedAI = !!remainingTags && remainingTags.length > 0;

    if (needsAdvancedAI) {
      try {
        const cvars = lead.custom_vars || {};

        if (cvars.apify_run_id) {
          // We are already polling Apify
          const run = await checkApifyRun(cvars.apify_run_id);
          if (['RUNNING', 'READY', 'INITIALIZING'].includes(run.status)) {
            console.log(`[SEND-ACTION] Lead ${lead.id} waiting for Apify (advanced AI)...`);
            return res.status(202).json({ 
              success: true, 
              status: 'processing', 
              message: 'Esperando análisis del perfil (Apify)...',
              message_sent: finalMessage 
            });
          } else if (run.status === 'SUCCEEDED') {
            const items = await fetchApifyDataset(run.defaultDatasetId);
            cvars.scraped_profile = items[0] || {};
            delete cvars.apify_run_id;
            await supabaseAdmin.from('leads').update({ custom_vars: cvars }).eq('id', lead.id);
            console.log(`[SEND-ACTION] Lead ${lead.id} profile scraped successfully.`);
          } else {
            console.error(`[SEND-ACTION] Apify scraping failed: ${run.status} for lead ${lead.id}`);
            delete cvars.apify_run_id;
            cvars.scraped_profile = { error: 'Apify failed' };
            await supabaseAdmin.from('leads').update({ custom_vars: cvars }).eq('id', lead.id);
          }
        } else if (!cvars.scraped_profile) {
          if (!process.env.APIFY_API_TOKEN) {
            console.warn('[SEND-ACTION] APIFY_API_TOKEN missing — skipping advanced AI vars, sending without them.');
          } else {
            const inputUrls = [lead.linkedin_url].filter(Boolean);
            if (inputUrls.length > 0) {
              console.log(`[SEND-ACTION] Lead ${lead.id} starting Apify profile scraper...`);
              try {
                const { runId } = await startApifyRun(ACTOR_PROFILE_SCRAPER, {
                  urls: inputUrls,
                  profileUrls: inputUrls,
                });
                cvars.apify_run_id = runId;
                await supabaseAdmin.from('leads').update({ custom_vars: cvars }).eq('id', lead.id);
                return res.status(202).json({ 
                  success: true, 
                  status: 'processing', 
                  message: 'Iniciando lectura de perfil (Apify)...',
                  message_sent: finalMessage 
                });
              } catch (apifyErr) {
                console.error(`[SEND-ACTION] Apify start failed: ${apifyErr.message} — sending message without advanced AI vars.`);
              }
            }
          }
        }

        // If we have scraped data, try to generate AI variables
        if (cvars.scraped_profile && !cvars.scraped_profile.error) {
          let aiPrompt = '';
          if (campaignId) {
            const { data: camp } = await supabaseAdmin.from('campaigns').select('settings').eq('id', campaignId).single();
            aiPrompt = camp?.settings?.ai_prompt || '';
          }
          finalMessage = await generateAdvancedAIVariables(finalMessage, lead, aiPrompt, actionType);
        }
      } catch (advErr) {
        console.error(`[SEND-ACTION] Advanced AI flow error: ${advErr.message} — stripping AI tags and sending anyway.`);
      }

      // Strip any remaining unresolved AI variable tags
      finalMessage = finalMessage.replace(/\{\{\w+\}\}/g, '');
    }

    // Fallback: ALWAYS strip lingering {{tags}} across the whole code path before Unipile
    finalMessage = finalMessage.replace(/\{\{\w+\}\}/g, '');

    // Execute the action (skip if simulate)
    let result = { simulated: true };
    if (!simulate) {
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
        });
      }
    } else {
      console.log(`[SEND-ACTION] SIMULATE - skipped Unipile for ${linkedinId}`);
    }

    console.log(`[SEND-ACTION] ✓ ${simulate ? '(SIMULATED) ' : ''}${actionType} sent to ${linkedinId} via ${account.profile_name}`);
    return res.status(200).json({
      success: true,
      action: actionType,
      simulate: !!simulate,
      message_sent: finalMessage,
      message: `✓ ${simulate ? '[Simulacro] ' : ''}${actionType === 'invitation' ? 'Invitación' : 'Mensaje'} ${simulate ? 'generado' : 'enviado'} para ${lead.first_name}`,
    });
  } catch (err) {
    console.error('[SEND-ACTION] Error:', err.message);
    // Update lead with error
    await supabaseAdmin.from('leads').update({
      sequence_status: 'failed',
    }).eq('id', leadId);
    return res.status(500).json({ error: err.message });
  }
}
