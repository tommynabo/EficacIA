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
    const { accountId, actionType = 'invitation', content } = req.body || {};

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

    // If no accountId provided, find the first valid LinkedIn account for this team
    let resolvedAccountId = accountId;
    if (!resolvedAccountId) {
      const { data: accounts } = await supabaseAdmin
        .from('linkedin_accounts')
        .select('id')
        .in('team_id', teamIds)
        .eq('is_valid', true)
        .limit(1);
      resolvedAccountId = accounts?.[0]?.id;
    }
    if (!resolvedAccountId) {
      return res.status(400).json({ error: 'No hay cuenta de LinkedIn conectada. Ve a Cuentas para agregar una.' });
    }

    // Call the send-action endpoint to actually send via Unipile
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host;
    const campaignName = lead.campaigns?.name || '';
    const finalContent = content || `Hola {{nombre}}, vi tu perfil y me gustaría conectar contigo.`;

    try {
      const sendRes = await fetch(`${protocol}://${host}/api/linkedin/send-action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-engine-key': process.env.JWT_SECRET || 'dev-secret',
        },
        body: JSON.stringify({
          leadId: id,
          accountId: resolvedAccountId,
          actionType,
          content: finalContent,
          useAI: !content, // Use AI if no custom content provided
          campaignName,
        }),
      });

      const result = await sendRes.json();
      if (!sendRes.ok) {
        return res.status(sendRes.status).json({ error: result.error || 'Error al enviar' });
      }

      return res.status(200).json(result);
    } catch (err) {
      console.error('[SEND] Error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Método no permitido' });
}
  }

  return res.status(405).json({ error: 'Método no permitido' });
}
