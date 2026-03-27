import { createClient } from '@supabase/supabase-js';

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

/**
 * Valida un token (JWT de Supabase) o una API Key permanente.
 * Lógica:
 * 1. Extrae de 'x-api-key' o 'Authorization: Bearer ...'
 * 2. Intenta validar como JWT vía supabase.auth.getUser()
 * 3. Si falla, intenta buscar en la tabla 'api_keys' (usando Service Role para saltar RLS)
 */
export async function getAuthUser(req) {
  // 1. Extraer el token/key de las cabeceras
  let token = req.headers['x-api-key'] || req.headers['authorization'] || '';
  token = token.replace('Bearer ', '').trim();

  if (!token) return null;

  // 2. INTENTO 1: Validar como JWT de Supabase
  if (token.includes('.')) {
    try {
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
      if (user && !error) {
        return { ...user, userId: user.id };
      }
    } catch (e) {
      console.warn('[AUTH] JWT verification failed');
    }
  }

  // 3. INTENTO 2: Validar como API Key permanente
  try {
    const { data: apiKeyData, error: apiKeyError } = await supabaseAdmin
      .from('api_keys')
      .select('user_id')
      .eq('key_value', token)
      .maybeSingle();

    if (apiKeyData && !apiKeyError) {
      return { 
        id: apiKeyData.user_id, 
        userId: apiKeyData.user_id, 
        role: 'authenticated', 
        is_api_key: true 
      };
    }
  } catch (e) {
    console.error('[AUTH] API Key DB lookup error:', e.message);
  }

  return null;
}
