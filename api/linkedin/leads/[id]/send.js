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

async function generateAIMessage(lead, campaignName) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return `Hola ${lead.first_name}, vi tu perfil y me gustaría conectar contigo.`;
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 200,
        messages: [
          {
            role: 'user',
            content: `Escribe un mensaje de LinkedIn corto y personalizado (máximo 150 chars) para conectar con ${lead.first_name} ${lead.last_name}, que trabaja en ${lead.company || 'su empresa'} como ${lead.job_title || lead.position || 'profesional'}. Campaña: ${campaignName || 'general'}. Solo el mensaje, sin comillas.`,
          },
        ],
      }),
    });

    const data = await response.json();
    return data?.content?.[0]?.text || `Hola ${lead.first_name}, me gustaría conectar contigo.`;
  } catch {
    return `Hola ${lead.first_name}, vi tu perfil y me gustaría conectar contigo.`;
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
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'ID de lead requerido' });

    // Obtener lead y verificar propiedad
    const { data: teams } = await supabaseAdmin
      .from('teams')
      .select('id')
      .eq('owner_id', userId);

    const teamIds = (teams || []).map((t) => t.id);
    if (teamIds.length === 0) return res.status(404).json({ error: 'Lead no encontrado' });

    const { data: lead, error: leadError } = await supabaseAdmin
      .from('leads')
      .select('*, campaigns(name)')
      .eq('id', id)
      .in('team_id', teamIds)
      .single();

    if (leadError || !lead) return res.status(404).json({ error: 'Lead no encontrado' });
    if (lead.sent_message) return res.status(400).json({ error: 'Ya se envió un mensaje a este lead' });

    // Generar mensaje IA
    const campaignName = lead.campaigns?.name || '';
    const message = await generateAIMessage(lead, campaignName);

    // Marcar como enviado
    const { error: updateError } = await supabaseAdmin
      .from('leads')
      .update({
        status: 'contacted',
        sent_message: true,
        sent_at: new Date().toISOString(),
        ai_message: message,
      })
      .eq('id', id);

    if (updateError) return res.status(400).json({ error: updateError.message });

    return res.status(200).json({
      success: true,
      message_sent: message,
      message: '✓ Mensaje enviado',
    });
  }

  return res.status(405).json({ error: 'Método no permitido' });
}
