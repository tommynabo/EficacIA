/**
 * /api/linkedin/unibox
 *
 * Endpoints:
 *  GET  ?action=chats&accountId=XXX&cursor=&limit=   → lista de conversaciones
 *  GET  ?action=messages&chatId=XXX&accountId=XXX    → mensajes de una conversación
 *  POST ?action=send                                 → { chatId, accountId, text }
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
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    return decoded.userId;
  } catch {
    return null;
  }
}

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });

  const teamId = await getTeamId(userId);
  if (!teamId) return res.status(403).json({ error: 'Equipo no encontrado' });

  const action = req.query.action;
  const dsn = (process.env.UNIPILE_DSN || '').trim();
  const apiKey = (process.env.UNIPILE_API_KEY || '').trim();

  if (!dsn || !apiKey) {
    return res.status(500).json({ error: 'Unipile no configurado' });
  }

  // ─── GET chats ────────────────────────────────────────────────────
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

    try {
      const r = await fetch(`${unipileBase()}/api/v1/chats?${params}`, {
        headers: unipileHeaders(),
      });
      if (!r.ok) {
        const err = await r.text();
        console.error('[UNIBOX][chats]', r.status, err);
        return res.status(r.status).json({ error: 'Error obteniendo conversaciones' });
      }
      const data = await r.json();
      return res.status(200).json(data);
    } catch (e) {
      console.error('[UNIBOX][chats] excepción:', e);
      return res.status(500).json({ error: 'Error de red con Unipile' });
    }
  }

  // ─── GET messages ─────────────────────────────────────────────────
  if (req.method === 'GET' && action === 'messages') {
    const { chatId, cursor, limit = '50' } = req.query;
    if (!chatId) return res.status(400).json({ error: 'Falta chatId' });

    const params = new URLSearchParams({ limit });
    if (cursor) params.set('cursor', cursor);

    try {
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
    } catch (e) {
      console.error('[UNIBOX][messages] excepción:', e);
      return res.status(500).json({ error: 'Error de red con Unipile' });
    }
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

    try {
      // Unipile API for marking as read is PUT /api/v1/chats/:id
      // with body { unread_count: 0 } or similar, OR there's a specific endpoint.
      // Usually, just fetching messages doesn't mark them as read yet.
      // Unipile Docs: `POST /api/v1/chats/:id/read` marks all messages as read.
      const r = await fetch(`${unipileBase()}/api/v1/chats/${chatId}/read`, {
        method: 'POST',
        headers: unipileHeaders(),
      });
      if (!r.ok) {
        // Fallback: PUT /api/v1/chats/:id
        await fetch(`${unipileBase()}/api/v1/chats/${chatId}`, {
          method: 'PUT',
          headers: unipileHeaders(),
          body: JSON.stringify({ unread_count: 0 }),
        });
      }
      return res.status(200).json({ success: true });
    } catch (e) {
      console.error('[UNIBOX][read] excepción:', e);
      return res.status(500).json({ error: 'Error de red con Unipile' });
    }
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

    try {
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
    } catch (e) {
      console.error('[UNIBOX][send] excepción:', e);
      return res.status(500).json({ error: 'Error de red con Unipile' });
    }
  }

  return res.status(405).json({ error: 'Método no permitido' });
}
