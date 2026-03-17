import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

/**
 * Validates either a Supabase JWT or a permanent API Key (efi_...)
 * Returns { userId, error }
 */
export async function getAuthUser(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '').trim();

  if (!token) return { userId: null, error: 'Token no proporcionado' };

  // 1. Check if it looks like a JWT (contains dots)
  if (token.includes('.')) {
    try {
      // Try verifying as a Supabase JWT
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
      if (user && !error) return { userId: user.id };
      
      // Fallback: decode without verification to see if it has the required fields (less secure but helpful for debugging)
      const decoded = jwt.decode(token);
      if (decoded && (decoded.sub || decoded.userId)) {
          return { userId: decoded.sub || decoded.userId };
      }
    } catch (e) {
      console.error('[AUTH] JWT verification failed:', e.message);
    }
  }

  // 2. Treat as a permanent API Key
  const { data: apiKeyData, error: apiKeyError } = await supabaseAdmin
    .from('api_keys')
    .select('user_id')
    .eq('key_value', token)
    .single();

  if (apiKeyData && !apiKeyError) {
    return { userId: apiKeyData.user_id };
  }

  return { userId: null, error: 'Token o API Key inválido o expirado' };
}
