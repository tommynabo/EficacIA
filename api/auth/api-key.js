import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '../_lib/auth.js';
import crypto from 'crypto';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

export default async function handler(req, res) {
  // CORS configuration for local dev and production
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { userId, error: authError } = await getAuthUser(req);
  if (!userId) {
    console.error('[API-KEY] Auth error:', authError);
    return res.status(401).json({ error: 'No autenticado: ' + (authError || '') });
  }

  // GET: Retrieve existing API key
  if (req.method === 'GET') {
    try {
      const { data, error } = await supabaseAdmin
        .from('api_keys')
        .select('key_value')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json({ apiKey: data?.key_value || null });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // POST: Generate new API key
  if (req.method === 'POST') {
    try {
      // Use native crypto to avoid 'uuid' dependency
      const newKey = `efi_${crypto.randomUUID().replace(/-/g, '')}`;

      const { data, error } = await supabaseAdmin
        .from('api_keys')
        .upsert({ user_id: userId, key_value: newKey }, { onConflict: 'user_id' })
        .select()
        .single();

      if (error) {
        console.error('[API-KEY] DB Error:', error);
        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json({ apiKey: data.key_value });
    } catch (e) {
      console.error('[API-KEY] Runtime Error:', e);
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Método no permitido' });
}
