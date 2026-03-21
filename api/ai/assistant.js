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

// --- Hardcoded safety rules — DO NOT remove or soften these ---
const RULE_VARIABLES =
  'REGLA DE VARIABLES: Tienes estrictamente prohibido usar corchetes o inventar variables. ' +
  'LAS ÚNICAS VARIABLES QUE PUEDES USAR SON: {{first_name}}, {{last_name}}, {{company_name}}. ' +
  'Si no sabes un dato, no pongas un placeholder, redacta el texto para que funcione sin él.';

const RULE_INVITATION =
  'REGLA CRÍTICA DE API: Este mensaje es una nota de conexión de LinkedIn. ' +
  'EL LÍMITE ES DE 300 CARACTERES, PERO DEBES DEVOLVER MÁXIMO 200 CARACTERES ' +
  'para dejar espacio a la variable del nombre. SÉ EXTREMADAMENTE BREVE. NO AÑADAS SALUDOS LARGOS.';

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

  const { messages, source, stepType, leadName } = req.body || {};

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

  // Step 1: Load the user's custom role prompt from the database
  const { data: userData } = await supabase
    .from('users')
    .select('ai_prompt_sequence, ai_prompt_unibox')
    .eq('id', userId)
    .single();

  const rolePrompt = isUnibox
    ? ((userData?.ai_prompt_unibox || '').trim() || FALLBACK_PROMPT_UNIBOX)
    : ((userData?.ai_prompt_sequence || '').trim() || FALLBACK_PROMPT_SEQUENCE);

  // Steps 2 & 3: Build hardened system prompt with mandatory rules
  const systemParts = [
    rolePrompt,
    RULE_VARIABLES,
    isInvitation
      ? RULE_INVITATION
      : 'Devuelve ÚNICAMENTE el texto del mensaje, sin comillas, sin encabezados, sin explicaciones.',
    'Responde siempre en español.',
  ];

  if (leadName) {
    systemParts.push(`El usuario está hablando con el contacto: ${leadName}.`);
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

    // Safety slice for invitation steps in case the model ignores the character rule
    if (isInvitation) {
      content = content.slice(0, 290);
    }

    return res.status(200).json({ content, model: MODEL });
  } catch (err) {
    console.error('[AI ASSISTANT]', err);
    return res.status(500).json({ error: err.message || 'Error al llamar a la IA' });
  }
}
