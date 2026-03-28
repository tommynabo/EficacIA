import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

/**
 * Inyecta las cabeceras CORS básicas en la respuesta de Node.js
 */
export function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, Accept');
}

export async function getAuthUser(req) {
  try {
    const authHeader = req.headers['authorization'];
    const token = req.headers['x-api-key'] || (authHeader ? authHeader.replace('Bearer ', '') : null);

    if (!token) return null;

    // 1. System Admin B2B
    if (token === process.env.API_SECRET_KEY) {
      return { userId: 'system', role: 'admin' };
    }

    // 2. Lifetime Extension Token — looked up in DB, never expires
    const { data: userWithToken, error: tokenError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('extension_token', token)
      .single();

    if (userWithToken && !tokenError) {
      return { userId: userWithToken.id, id: userWithToken.id, role: 'user' };
    }

    // 3. Fallback: Web JWT (dashboard sessions)
    const decoded = jwt.decode(token);
    if (decoded) {
      const userId = decoded.sub || decoded.userId || decoded.id;
      if (userId) {
        return { ...decoded, userId, id: userId };
      }
    }

    return null;
  } catch (error) {
    console.error('[AUTH] Error verifying token:', error.message);
    return null;
  }
}
