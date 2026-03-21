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

  const systemPrompt = `Eres EficacIA Assistant, un asistente experto en ventas B2B y comunicación en LinkedIn.
Tu objetivo es ayudar al usuario a redactar, reescribir y mejorar mensajes para sus conversaciones de LinkedIn.
${leadName ? `El usuario está hablando actualmente con: ${leadName}.` : ''}
${stepType === 'invitation' ? 'RESTRICCIÓN CRÍTICA: Esto es una nota de invitación de LinkedIn, el límite máximo absoluto es de 300 caracteres. El mensaje DEBE ser de 300 caracteres o menos, contados con precisión. Si supera este límite, no es válido.' : ''}

Reglas:
- Responde siempre en español
- Sé conciso y directo (máximo 300 palabras por respuesta salvo que el usuario pida algo más largo)
- Enfócate en ayudar a redactar mensajes naturales, persuasivos y no robóticos
- Cuando sugieras mensajes para LinkedIn, asegúrate de que sean breves (< 300 caracteres para invitaciones)
- Puedes sugerir estrategias de seguimiento, cierres suaves, o respuestas a objeciones comunes`;

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 600,
      system: systemPrompt,
      messages: validatedMessages,
    });

    const content = response.content[0]?.type === 'text' ? response.content[0].text : '';
    return res.status(200).json({ content, model: MODEL });
  } catch (err) {
    console.error('[AI ASSISTANT]', err);
    return res.status(500).json({ error: err.message || 'Error al llamar a la IA' });
  }
}
