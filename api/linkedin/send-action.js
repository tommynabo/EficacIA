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
import { getAuthUser } from '../_lib/auth.js';

const ACTOR_PROFILE_SCRAPER = 'supreme_coder~linkedin-profile-scraper';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);


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
  
  const safeInput = { ...input };
  console.log(`[APIFY] Starting run: ${actorSlug} with input:`, JSON.stringify(safeInput).slice(0, 500));

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error(`[APIFY] Error response (${res.status}):`, errText);
    if (res.status === 404) {
      console.error(`[APIFY] El actor '${actorSlug}' no existe o no tienes acceso.`);
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
 * ALWAYS tries to generate — uses scraped data if available, falls back to lead DB fields.
 */
async function generateAdvancedAIVariables(template, lead, aiPrompt, actionType) {
  const unresolvedTags = template.match(/\{\{(\w+)\}\}/g);
  if (!unresolvedTags || unresolvedTags.length === 0) {
    console.log('[AI-VARS] No unresolved tags found, skipping.');
    return template;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[AI-VARS] ANTHROPIC_API_KEY not set — cannot generate AI variables.');
    return template;
  }

  const scraped = lead.custom_vars?.scraped_profile || {};

  // Build profile from ALL available sources — scraped data + lead DB fields
  const condensedProfile = {
    nombre: lead.first_name || '',
    apellido: lead.last_name || '',
    empresa: lead.company || scraped.companyName || scraped.company || '',
    cargo: lead.position || lead.job_title || scraped.headline || scraped.title || '',
    about: scraped.about || scraped.summary || scraped.description || '',
    headline: scraped.headline || scraped.title || lead.position || lead.job_title || '',
    experience: Array.isArray(scraped.experience) 
      ? scraped.experience.slice(0, 3).map(e => `${e.title || e.role || ''} at ${e.companyName || e.company || ''} (${e.duration || e.timePeriod || ''})`)
      : [],
    recent_posts: Array.isArray(scraped.posts) 
      ? scraped.posts.slice(0, 3).map(p => p.text || p.title || p.commentary || '')
      : (Array.isArray(scraped.activities) 
        ? scraped.activities.slice(0, 3).map(a => a.text || a.title || '')
        : []),
    skills: Array.isArray(scraped.skills) ? scraped.skills.slice(0, 5).map(s => s.name || s) : [],
    education: Array.isArray(scraped.education) ? scraped.education.slice(0, 2).map(e => `${e.degree || e.fieldOfStudy || ''} - ${e.schoolName || e.school || ''}`) : [],
    linkedin_url: lead.linkedin_url || '',
  };

  console.log('[AI-VARS] Condensed profile for Claude:', JSON.stringify(condensedProfile).slice(0, 500));

  // Extract clean variable names
  const requestedVars = unresolvedTags.map(v => v.replace(/[{}]/g, '')).join(', ');
  const numVars = unresolvedTags.length;

  // Calculate strict character budget for invitations (200 char LinkedIn limit)
  let lengthConstraint = "Sé conciso. Cada variable debe ser una frase corta (máximo 15-20 palabras).";
  if (actionType === 'invitation') {
    const staticLen = template.replace(/\{\{(.*?)\}\}/g, '').length;
    const totalBudget = Math.max(10, 200 - staticLen);
    const perVarBudget = Math.max(5, Math.floor(totalBudget / numVars));
    lengthConstraint = `LÍMITE ABSOLUTO: La invitación de LinkedIn tiene un máximo de 200 caracteres TOTALES. El texto estático ya ocupa ${staticLen} caracteres. Solo quedan ${totalBudget} caracteres para TODAS las variables combinadas. Cada variable debe tener MÁXIMO ${perVarBudget} caracteres. Sé extremadamente breve.`;
  }

  const sysPrompt = `Eres un experto en cold outreach B2B en español. Tu tarea es generar el reemplazo exacto para las variables dinámicas en un mensaje.

MENSAJE COMPLETO (con las variables a rellenar):
"${template}"

REGLAS CRÍTICAS DE COHERENCIA:
- Lee el MENSAJE COMPLETO de arriba. El texto que generes para cada variable DEBE encajar gramaticalmente con lo que viene ANTES y DESPUÉS en el mensaje.
- Ejemplo: si el mensaje dice "No estoy de acuerdo con {{comentario_post}}", la variable debe ser algo que tenga sentido después de "No estoy de acuerdo con", como: "que la IA vaya a reemplazar al talento humano" (NO un elogio, porque la frase dice "no estoy de acuerdo").
- Ejemplo: si el mensaje dice "me parece brutal {{comentario_post}}", la variable debe ser algo que tenga sentido después de "me parece brutal", como: "tu enfoque sobre liderazgo ágil".
- La variable es un FRAGMENTO de oración que se insertará directamente. NO debe ser una oración completa con punto final.
- NO empieces la variable con mayúscula a menos que sea un nombre propio.
- NO añadas punto final dentro de la variable.

${lengthConstraint}

REGLAS DE CONTENIDO:
- SIEMPRE da un valor para CADA variable. NUNCA devuelvas un valor vacío.
- Para "comentario_post": genera un tema/opinión creíble relacionado con su sector, cargo o experiencia reciente.
- Para "especializacion": infiere de su cargo, empresa o sector.
- Para "experiencia": menciona algo breve sobre su trayectoria.
- Para "empresa": usa la empresa real si la tienes, o infiere algo de su perfil.
- Tono profesional pero coloquial. Sin comillas dobles.

Perfil del lead: ${JSON.stringify(condensedProfile)}
Variables solicitadas: ${requestedVars}
Prompt de IA extra: "${aiPrompt || 'Sé creativo y breve.'}"`;

  try {
    console.log('[AI-VARS] Calling Claude Haiku for variables:', requestedVars);
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 400,
        messages: [{
          role: 'user',
          content: `${sysPrompt}\n\nDevuelve SOLO un JSON válido: {"nombre_variable": "texto generado"}.\nEjemplo para "No estoy de acuerdo con {{comentario_post}}": {"comentario_post": "que el cold email esté muerto en B2B"}\nNO incluyas explicaciones, solo el JSON.`,
        }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[AI-VARS] Claude API error:', res.status, errText.slice(0, 200));
      return template;
    }

    const data = await res.json();
    const textResp = data?.content?.[0]?.text || '{}';
    console.log('[AI-VARS] Raw Claude response:', textResp.slice(0, 500));

    // Try to parse JSON from Claude's response
    const match = textResp.match(/\{[\s\S]*\}/);
    if (!match) {
      console.error('[AI-VARS] Could not find JSON in Claude response');
      return template;
    }

    const rawVarsMap = JSON.parse(match[0]);
    console.log('[AI-VARS] Parsed variables:', rawVarsMap);

    // Sanitize keys and replace in template
    let newTemplate = template;
    for (const [k, v] of Object.entries(rawVarsMap)) {
      const cleanKey = k.replace(/[{}]/g, '').trim();
      if (cleanKey && v && String(v).trim()) {
        newTemplate = newTemplate.replace(new RegExp(`\\{\\{${cleanKey}\\}\\}`, 'g'), String(v).trim());
        console.log(`[AI-VARS] ✓ Replaced {{${cleanKey}}} → "${String(v).trim().slice(0, 50)}"`);
      }
    }
    return newTemplate;
  } catch (err) {
    console.error('[AI-VARS] Error calling Claude:', err.message);
    return template;
  }
}

/**
 * Check if a scraped_profile has meaningful data (not just an empty object from a previous fallback).
 */
function hasRealScrapedData(profile) {
  if (!profile || profile.error) return false;
  // Check if it has any real content fields
  return !!(profile.about || profile.summary || profile.headline || profile.title ||
    (Array.isArray(profile.experience) && profile.experience.length > 0) ||
    (Array.isArray(profile.posts) && profile.posts.length > 0) ||
    (Array.isArray(profile.activities) && profile.activities.length > 0) ||
    profile.companyName || profile.firstName);
}

/**
 * Try to scrape a LinkedIn profile via Apify (best-effort, non-blocking for AI generation).
 * Returns the scraped profile data, 'PENDING', or null.
 */
async function tryApifyScrape(lead, cvars) {
  if (!process.env.APIFY_API_TOKEN) {
    console.log('[APIFY] No APIFY_API_TOKEN — skipping scrape.');
    return null;
  }

  // If we already have a running Apify job, check it
  if (cvars.apify_run_id) {
    try {
      const run = await checkApifyRun(cvars.apify_run_id);
      if (['RUNNING', 'READY', 'INITIALIZING'].includes(run.status)) {
        console.log(`[APIFY] Lead ${lead.id} still processing (${run.status})...`);
        return 'PENDING';
      } else if (run.status === 'SUCCEEDED') {
        const items = await fetchApifyDataset(run.defaultDatasetId);
        const profile = items[0] || {};
        delete cvars.apify_run_id;
        cvars.scraped_profile = profile;
        await supabaseAdmin.from('leads').update({ custom_vars: cvars }).eq('id', lead.id);
        console.log(`[APIFY] ✓ Lead ${lead.id} profile scraped successfully.`);
        return profile;
      } else {
        console.error(`[APIFY] Scraping failed: ${run.status} for lead ${lead.id}`);
        delete cvars.apify_run_id;
        await supabaseAdmin.from('leads').update({ custom_vars: cvars }).eq('id', lead.id);
        return null;
      }
    } catch (err) {
      console.error(`[APIFY] Error checking run: ${err.message}`);
      delete cvars.apify_run_id;
      await supabaseAdmin.from('leads').update({ custom_vars: cvars }).eq('id', lead.id);
      return null;
    }
  }

  // No existing run — start a new one if we don't have REAL scraped data
  if (!hasRealScrapedData(cvars.scraped_profile)) {
    const inputUrls = [lead.linkedin_url].filter(Boolean);
    if (inputUrls.length > 0) {
      try {
        console.log(`[APIFY] Starting profile scraper for lead ${lead.id} using URL: ${inputUrls[0]}`);
        
        // Profiles scraper usually expects an array of strings for profileUrls or urls
        const { runId } = await startApifyRun(ACTOR_PROFILE_SCRAPER, {
          urls: inputUrls,
          profileUrls: inputUrls,
        });
        cvars.apify_run_id = runId;
        // Clear stale empty scraped_profile
        delete cvars.scraped_profile;
        await supabaseAdmin.from('leads').update({ custom_vars: cvars }).eq('id', lead.id);
        return 'PENDING';
      } catch (apifyErr) {
        console.error(`[APIFY] Start failed: ${apifyErr.message}`);
        return null;
      }
    }
  }

  // Already have real scraped data
  if (hasRealScrapedData(cvars.scraped_profile)) {
    console.log(`[APIFY] Lead ${lead.id} already has real scraped data, reusing.`);
    return cvars.scraped_profile;
  }

  return null;
}

/**
 * Extract LinkedIn identifier from a profile URL.
 * Unipile needs the provider_id (vanity name or urn).
 */
function extractLinkedInId(url) {
  if (!url) return null;
  const m = url.match(/linkedin\.com\/in\/([^/?#]+)/);
  return m ? m[1] : null;
}

/**
 * Resolve a LinkedIn identifier (username/vanity name) to a Unipile provider_id
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
 */
async function sendInvitation(unipileAccountId, linkedinId, message) {
  const providerId = await getUnipileProviderId(unipileAccountId, linkedinId);
  const body = {
    provider_id: providerId,
    account_id: unipileAccountId,
  };

  const finalMsg = (message || '').trim().slice(0, 200);
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
 */
async function sendMessage(unipileAccountId, linkedinId, message) {
  console.log('[SEND-ACTION] Sending message to:', linkedinId);
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

/**
 * Registra una cuenta en Unipile usando la cookie li_at.
 */
async function registerUnipileAccount(liAt) {
  const dsn = (process.env.UNIPILE_DSN || '').trim();
  const apiKey = (process.env.UNIPILE_API_KEY || '').trim();
  if (!dsn || !apiKey) throw new Error('Unipile configuration missing');

  try {
    console.log('[SEND-ACTION][UNIPILE] Lazy connection: registering cookie account...');
    const response = await fetch(`https://${dsn}/api/v1/accounts`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey,
      },
      body: JSON.stringify({
        type: 'LINKEDIN',
        connection_params: {
          linkedin_cookie: liAt
        }
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || `Status ${response.status}`);
    console.log('[SEND-ACTION][UNIPILE] Lazy connection successful:', data.id);
    return data.id;
  } catch (err) {
    console.error('[SEND-ACTION][UNIPILE] Lazy connection failed:', err.message);
    throw err;
  }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const internalKey = req.headers['x-engine-key'];
  const isInternal = internalKey && internalKey === (process.env.JWT_SECRET || 'dev-secret');
  
  let userId;
  if (isInternal) {
    userId = 'engine';
  } else {
    const { userId: authUserId } = await getAuthUser(req);
    userId = authUserId;
  }

  if (!userId) return res.status(401).json({ error: 'No autenticado' });

  const { leadId, accountId, actionType, content, campaignId, campaignName, simulate } = req.body || {};
  
  if (!leadId || !accountId || !actionType) {
    const missing = [];
    if (!leadId) missing.push('leadId');
    if (!accountId) missing.push('accountId');
    if (!actionType) missing.push('actionType');
    console.error(`[SEND-ACTION] Missing payload fields: ${missing.join(', ')}`);
    return res.status(400).json({ error: `Faltan campos requeridos: ${missing.join(', ')}` });
  }

  try {
    // Fetch the lead
    const { data: lead, error: leadErr } = await supabaseAdmin
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();
    if (leadErr || !lead) return res.status(404).json({ error: 'Lead no encontrado' });

    // Fetch the LinkedIn account
    const { data: account, error: accErr } = await supabaseAdmin
      .from('linkedin_accounts')
      .select('id, unipile_account_id, profile_name, session_cookie')
      .eq('id', accountId)
      .single();
    
    if (accErr || !account) return res.status(400).json({ error: 'Cuenta de LinkedIn no encontrada' });

    let activeUnipileId = account.unipile_account_id;

    // --- Lazy Unipile Connection ---
    if (!activeUnipileId && account.session_cookie && account.session_cookie.length > 20) {
      console.log(`[SEND-ACTION] Account ${accountId} missing Unipile ID but has cookie. Linking now...`);
      try {
        activeUnipileId = await registerUnipileAccount(account.session_cookie);
        // Update DB so next time it's already there
        await supabaseAdmin
          .from('linkedin_accounts')
          .update({ 
            unipile_account_id: activeUnipileId,
            connection_method: 'unipile'
          })
          .eq('id', accountId);
      } catch (linkErr) {
        return res.status(400).json({ error: `Error conectando cuenta a Unipile: ${linkErr.message}` });
      }
    }

    if (!activeUnipileId) {
      return res.status(400).json({ error: 'Cuenta de LinkedIn no está conectada vía Unipile (ID faltante)' });
    }

    // ─── Determine userId for AI credit operations ───────────────────────────
    // When called from the campaign engine, userId = 'engine'; resolve the real
    // owner from the campaign team so we can check and deduct AI credits.
    let creditUserId = (userId !== 'engine') ? userId : null;
    if (!creditUserId && campaignId) {
      try {
        const { data: creditCamp } = await supabaseAdmin.from('campaigns')
          .select('team_id').eq('id', campaignId).single();
        if (creditCamp?.team_id) {
          const { data: creditTeam } = await supabaseAdmin.from('teams')
            .select('owner_id').eq('id', creditCamp.team_id).single();
          creditUserId = creditTeam?.owner_id || null;
        }
      } catch { /* non-fatal */ }
    }

    const linkedinId = extractLinkedInId(lead.linkedin_url);
    if (!linkedinId) {
      return res.status(400).json({ error: 'El lead no tiene URL de LinkedIn válida' });
    }

    // ─── Step 1: Resolve basic template variables ────────────────────────────
    let finalMessage = content || '';
    finalMessage = resolveTemplate(finalMessage, lead);

    // ─── Step 2: Check if AI variables are needed ────────────────────────────
    const remainingTags = finalMessage.match(/\{\{(\w+)\}\}/g);
    const needsAdvancedAI = !!remainingTags && remainingTags.length > 0;

    // Snapshot of user's credit balance at the time of the check (used for
    // deduction after a successful send — avoids a second DB fetch).
    let aiCreditsSnapshot = null;

    if (needsAdvancedAI) {
      console.log(`[SEND-ACTION] Lead ${lead.id} needs AI vars: ${remainingTags.join(', ')}`);

      // ── Guard: verify the user has at least 1 AI credit before calling Claude
      if (creditUserId) {
        const { data: creditUser } = await supabaseAdmin.from('users')
          .select('ai_credits').eq('id', creditUserId).single();
        const currentCredits = creditUser?.ai_credits ?? 0;
        if (currentCredits < 1) {
          console.warn(`[SEND-ACTION] Insufficient AI credits for user ${creditUserId} (${currentCredits})`);
          await supabaseAdmin.from('leads').update({
            sequence_status: 'paused',
            error_message: 'Créditos de IA insuficientes. Recarga tu saldo en Configuración → Créditos.',
            next_action_at: null,
          }).eq('id', leadId);
          return res.status(402).json({
            error: 'INSUFFICIENT_AI_CREDITS',
            message: 'Créditos de IA insuficientes. Recarga tu saldo en Configuración → Créditos.',
          });
        }
        aiCreditsSnapshot = currentCredits;
      }

      try {
        const cvars = lead.custom_vars || {};

        // ─── Step 2a: Try Apify scraping (best-effort) ─────────────────────
        const apifyResult = await tryApifyScrape(lead, cvars);

        if (apifyResult === 'PENDING') {
          // Apify is still working — return 202 so frontend retries
          return res.status(202).json({ 
            success: true, 
            status: 'processing', 
            message: 'Analizando perfil de LinkedIn (Apify)... Reintentando automáticamente.',
            message_sent: finalMessage 
          });
        }

        // ─── Step 2b: ALWAYS call Claude — with scraped data OR DB info ────
        // Re-read lead to get any updates from Apify
        const { data: freshLead } = await supabaseAdmin
          .from('leads')
          .select('*')
          .eq('id', leadId)
          .single();

        let aiPrompt = '';
        if (campaignId) {
          const { data: camp } = await supabaseAdmin
            .from('campaigns')
            .select('settings')
            .eq('id', campaignId)
            .single();
          aiPrompt = camp?.settings?.ai_prompt || '';
        }

        console.log(`[SEND-ACTION] Calling Claude with AI prompt: "${(aiPrompt || 'default').slice(0, 100)}"`);
        finalMessage = await generateAdvancedAIVariables(
          finalMessage, 
          freshLead || lead, 
          aiPrompt, 
          actionType
        );
      } catch (advErr) {
        console.error(`[SEND-ACTION] AI flow error: ${advErr.message}`);
      }

      // Strip any remaining unresolved tags as last resort
      finalMessage = finalMessage.replace(/\{\{\w+\}\}/g, '');
    }

    // Fallback: ALWAYS strip lingering {{tags}} across the whole code path before Unipile
    finalMessage = finalMessage.replace(/\{\{\w+\}\}/g, '');

    // Execute the action (skip if simulate)
    let result = { simulated: true };
    if (!simulate) {
      if (actionType === 'invitation') {
        result = await sendInvitation(activeUnipileId, linkedinId, finalMessage);
      } else if (actionType === 'message') {
        result = await sendMessage(activeUnipileId, linkedinId, finalMessage);
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

      // ── Deduct 1 AI credit after a successful real send ────────────────────
      // Only deduct if AI variables were used (aiCreditsSnapshot was set) and
      // we have a valid user to charge. The WHERE ai_credits >= 1 guard prevents
      // going negative if two jobs for the same user run in parallel.
      if (aiCreditsSnapshot !== null && creditUserId) {
        try {
          await supabaseAdmin.from('users')
            .update({ ai_credits: Math.max(0, aiCreditsSnapshot - 1) })
            .eq('id', creditUserId)
            .gte('ai_credits', 1);
          console.log(`[SEND-ACTION] ✓ AI credit deducted for user ${creditUserId}. New balance: ${aiCreditsSnapshot - 1}`);
        } catch (decrErr) {
          console.warn('[SEND-ACTION] Could not deduct AI credit:', decrErr.message);
        }
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
