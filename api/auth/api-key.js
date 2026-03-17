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
      const newKey = `efi_${crypto.randomUUID().replace(/-/g, '')}`;

      // First, try to see if a key already exists for this user
      const { data: existingData } = await supabaseAdmin
        .from('api_keys')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      let result;
      if (existingData) {
        // Update existing
        result = await supabaseAdmin
          .from('api_keys')
          .update({ key_value: newKey })
          .eq('id', existingData.id)
          .select()
          .single();
      } else {
        // Insert new
        result = await supabaseAdmin
          .from('api_keys')
          .insert({ user_id: userId, key_value: newKey })
          .select()
          .single();
      }

      if (result.error) {
        console.error('[API-KEY] DB Error:', result.error);
        return res.status(500).json({ error: result.error.message });
      }

      return res.status(200).json({ apiKey: result.data.key_value });
    } catch (e) {
      console.error('[API-KEY] Runtime Error:', e);
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Método no permitido' });
}
