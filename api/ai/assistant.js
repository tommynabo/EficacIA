/**
 * /api/ai/assistant
 *
 * POST { messages: [{role, content}], source: 'unibox'|'sequence', stepType?: 'invitation'|'message', leadName? }
 *      -> calls Anthropic Claude 3 Haiku and returns { content }
 *
 * Requires: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '../_lib/auth.js';

const MODEL = 'claude-3-haiku-20240307';

// Supabase admin client (singleton outside handler for performance)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

// --- Hardcoded personality & safety rules — DO NOT remove or soften these ---

// Core ghostwriter identity — always injected first, before any user-configured role
const GHOSTWRITER_CORE =
  'ACTÚA COMO UN REDACTOR FANTASMA (GHOSTWRITER) DE ÉLITE EN LINKEDIN. Tu nombre no existe.\n' +
  'No saludas al usuario, no das introducciones como "Aquí tienes una opción". ENTREGAS DIRECTAMENTE EL TEXTO FINAL.\n\n' +
  'REGLA DE ORO: Escribe siempre en primera persona del singular (YO), como si fueras el propio usuario que usa la plataforma.\n\n' +
  'PROHIBICIONES:\n' +
  '- Prohibido presentarte como "EficacIA Assistant" o cualquier nombre de asistente.\n' +
  '- Prohibido usar frases de soporte como "Espero que esto te ayude", "¡Espero que te sea útil!", "Aquí tienes", "Claro, aquí va", "Por supuesto".\n' +
  '- Prohibido usar comillas al principio y al final del mensaje.\n' +
  '- Prohibido añadir explicaciones, comentarios o preguntas después del mensaje.';

const RULE_VARIABLES =
  'VARIABLES: En secuencias masivas, usa estrictamente {{nombre}} y {{empresa}}. ' +
  'Tienes PROHIBIDO usar variables en inglés como {{first_name}}, {{last_name}} o {{company_name}}. ' +
  'En la UNIBOX, si recibes el nombre real del contacto, úsalo directamente sin llaves.';

const RULE_INVITATION =
  'INVITACIÓN — límite absoluto de 200 caracteres. Devuelve ÚNICAMENTE el texto, sin comillas, sin intro, sin explicaciones. ' +
  'Cuenta los caracteres antes de responder. El cuerpo debe ser minimalista porque el nombre del lead puede ser largo.';
// Fallback prompts when the user has not configured their own
const FALLBACK_PROMPT_SEQUENCE =
  'Eres un experto copywriter para ventas B2B en LinkedIn. Tu objetivo es redactar mensajes de ' +
  'outreach en frío que sean directos, personalizados y orientados a generar una respuesta.';

const FALLBACK_PROMPT_UNIBOX =
  'Eres un experto en ventas consultivas B2B. El contacto ya ha respondido a un mensaje inicial. ' +
  'Tu objetivo es continuar la conversación de forma natural, cualificar al prospecto y avanzar ' +
  'hacia una llamada o reunión.';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const { userId, error: authError } = await getAuthUser(req);
  if (!userId) return res.status(401).json({ error: authError || 'No autenticado' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurado en el servidor' });
  }

  const { messages, source, stepType, leadName, contactName, contactCompany } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages es requerido y debe ser un array no vacío' });
  }

  // Validate message structure and sanitize content
  const validatedMessages = messages
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role, content: m.content.trim().slice(0, 4000) })); // limit per-message length

  if (validatedMessages.length === 0) {
    return res.status(400).json({ error: 'No hay mensajes válidos' });
  }

  if (validatedMessages[validatedMessages.length - 1].role !== 'user') {
    return res.status(400).json({ error: 'El último mensaje debe ser del usuario' });
  }

  const isUnibox = source === 'unibox';
  const isInvitation = source === 'sequence' && stepType === 'invitation';

  // Step 1: Load the user's custom role prompt and ai_credits from the database
  const { data: userData } = await supabase
    .from('users')
    .select('ai_prompt_sequence, ai_prompt_unibox, ai_credits')
    .eq('id', userId)
    .single();

  // Step 1b: Check AI credits — block if exhausted
  const currentCredits = userData?.ai_credits ?? 0;
  if (currentCredits <= 0) {
    return res.status(403).json({ error: 'Créditos agotados', code: 'NO_CREDITS' });
  }

  const rolePrompt = isUnibox
    ? ((userData?.ai_prompt_unibox || '').trim() || FALLBACK_PROMPT_UNIBOX)
    : ((userData?.ai_prompt_sequence || '').trim() || FALLBACK_PROMPT_SEQUENCE);

  // Build hardened system prompt — ghostwriter identity always goes first
  const systemParts = [GHOSTWRITER_CORE, rolePrompt, RULE_VARIABLES];

  if (isUnibox && contactName) {
    // REAL conversation — use actual name, no placeholder variables
    const companyPart = contactCompany ? ` de la empresa ${contactCompany}` : '';
    systemParts.push(
      `CONTEXTO REAL: Estás redactando una respuesta para una conversación activa con ${contactName}${companyPart}. ` +
      `Usa el nombre "${contactName}" directamente en el texto si es natural. ` +
      'NO uses la variable {{nombre}} ni {{empresa}}; éstas son sólo para secuencias masivas.'
    );
  } else if (isInvitation) {
    systemParts.push(RULE_INVITATION);
  }

  systemParts.push('Responde siempre en español.');

  // Legacy fallback: contactName not provided but leadName exists
  if (leadName && !contactName) {
    systemParts.push(`Contexto: el destinatario del mensaje es ${leadName}.`);
  }

  const systemPrompt = systemParts.join('\n\n');

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: isInvitation ? 300 : 600,
      system: systemPrompt,
      messages: validatedMessages,
    });

    const raw = response.content[0]?.type === 'text' ? response.content[0].text : '';

    // Step 4: Post-process — strip surrounding quotes
    let content = raw.trim().replace(/^["'«»\u201c\u201d]+|["'«»\u201c\u201d]+$/g, '').trim();

    // Strip common AI intro fragments the model sometimes emits despite instructions
    content = content
      .replace(/^(Aqu[íi] tienes[^:]*:|Claro,?\s*(aqu[íi] (va|te presento)[^:]*:|[^:]{0,30}:)|Por supuesto[^:]*:|Entendido[^:]*:|Perfecto[^:]*:)\s*/i, '')
      .trim();

    // Strip common AI outro fragments
    content = content
      .replace(/\s*(Espero (que (esto|te|les?)(\s+\w+)?\s*(ayude|sirva|sea [úu]til|guste))[^.]*\.?|[¡!]Espero[^!]{1,80}[!.][^.]*\.?|Av[íi]same si[^.]{1,80}\.|[¿?]Qu[ée] te parece[^?]{1,80}[?.]?)\s*$/i, '')
      .trim();

    // Safety guard: invitations only — if the model ignored the 200-char rule, reject and ask for a shorter rewrite
    if (isInvitation && content.length > 250) {
      return res.status(400).json({
        error:
          'El mensaje de invitación supera el límite estricto de 250 caracteres. ' +
          'Por favor, pide a la IA que lo resuma más.',
      });
    }

    // Deduct 1 AI credit (best-effort, do not fail the response if this errors)
    supabase
      .from('users')
      .update({ ai_credits: Math.max(0, currentCredits - 1) })
      .eq('id', userId)
      .then(() => {})
      .catch((e) => console.warn('[AI ASSISTANT] Failed to deduct credit:', e.message));

    return res.status(200).json({ content, model: MODEL });
  } catch (err) {
    console.error('[AI ASSISTANT]', err);
    return res.status(500).json({ error: err.message || 'Error al llamar a la IA' });
  }
}