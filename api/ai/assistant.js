/**
 * /api/ai/assistant
 *
 * POST { messages: [{role, content}], leadName? }
 *      → calls Anthropic Claude 3 Haiku and returns { content }
 *
 * Requires: ANTHROPIC_API_KEY environment variable
 */

import Anthropic from '@anthropic-ai/sdk';
import jwt from 'jsonwebtoken';

const MODEL = 'claude-3-haiku-20240307'; // Claude 3 Haiku

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
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurado en el servidor' });
  }

  const { messages, leadName, stepType } = req.body || {};

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

  // Ensure the conversation ends with a user message (Anthropic requirement)
  if (validatedMessages[validatedMessages.length - 1].role !== 'user') {
    return res.status(400).json({ error: 'El último mensaje debe ser del usuario' });
  }

  const isInvitation = stepType === 'invitation';

  const systemPrompt = [
    'Eres un experto copywriter para ventas B2B en LinkedIn.',
    'TUS VARIABLES PERMITIDAS SON ÚNICAMENTE: {{first_name}}, {{last_name}}, {{company_name}}. DEBES usar {{first_name}} al saludar. NUNCA inventes nombres reales, usa SIEMPRE las variables.',
    isInvitation
      ? 'REGLA CRÍTICA: ESTO ES UNA NOTA DE CONEXIÓN DE LINKEDIN. TU RESPUESTA DEBE TENER UN MÁXIMO ABSOLUTO DE 250 CARACTERES (para dejar margen a las variables). SI TE PASAS, EL SISTEMA FALLARÁ. SÉ BREVE Y DIRECTO. Cuenta los caracteres con precisión antes de responder.'
      : 'No hay límite de caracteres, pero mantén la concisión B2B: párrafos cortos, orientados a acción, sin relleno innecesario.',
    'Devuelve ÚNICAMENTE el texto del mensaje, sin comillas, sin encabezados, sin explicaciones.',
    'Responde siempre en español.',
    leadName ? `El usuario está trabajando con el contacto: ${leadName}.` : '',
  ].filter(Boolean).join('\n');

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 600,
      system: systemPrompt,
      messages: validatedMessages,
    });

    const raw = response.content[0]?.type === 'text' ? response.content[0].text : '';
    // Strip surrounding quotes the model sometimes adds
    const content = raw.trim().replace(/^["'«»\u201c\u201d]+|["'«»\u201c\u201d]+$/g, '').trim();
    return res.status(200).json({ content, model: MODEL });
  } catch (err) {
    console.error('[AI ASSISTANT]', err);
    return res.status(500).json({ error: err.message || 'Error al llamar a la IA' });
  }
}
