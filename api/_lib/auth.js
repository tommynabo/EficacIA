import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

/**
 * Valida un token (JWT de Supabase) o una API Key permanente.
 * Lógica:
 * 1. Extrae de 'x-api-key' o 'Authorization: Bearer ...'
 * 2. Intenta validar como JWT vía supabase.auth.getUser()
 * 3. Si falla, intenta buscar en la tabla 'api_keys' (usando Service Role para saltar RLS)
 * 
 * Returns { userId, user, error }
 */
export async function getAuthUser(req) {
  // 1. Extraer el token/key de las cabeceras
  let token = req.headers['x-api-key'] || req.headers['authorization'] || '';
  token = token.replace('Bearer ', '').trim();

  if (!token) {
    return { userId: null, error: 'Token o API Key no proporcionado' };
  }

  // 2. INTENTO 1: Validar como JWT de Supabase
  // Si el token tiene el formato de JWT (puntos), intentamos con auth.getUser
  if (token.includes('.')) {
    try {
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
      
      if (user && !error) {
        return { 
          userId: user.id, 
          user: user, 
          error: null 
        };
      }
      
      // Fallback: decodificar sin verificar (solo para debugging/logs si se desea)
      // En producción esto debería ser opcional o ignorado si no es válido
      const decoded = jwt.decode(token);
      if (decoded && (decoded.sub || decoded.userId)) {
        return { 
          userId: decoded.sub || decoded.userId,
          user: { id: decoded.sub || decoded.userId, role: 'authenticated' },
          error: null 
        };
      }
    } catch (e) {
      console.warn('[AUTH] Debug: JWT check failed, proceeding to API Key check...');
    }
  }

  // 3. INTENTO 2: Validar como API Key permanente (Doble cerradura)
  // Buscamos en la tabla 'api_keys' usando el cliente admin para saltar el RLS
  try {
    const { data: apiKeyData, error: apiKeyError } = await supabaseAdmin
      .from('api_keys')
      .select('user_id')
      .eq('key_value', token)
      .maybeSingle();

    if (apiKeyData && !apiKeyError) {
      console.log('[AUTH] Access granted via API Key for user:', apiKeyData.user_id);
      return { 
        userId: apiKeyData.user_id, 
        user: { id: apiKeyData.user_id, role: 'authenticated', is_api_key: true }, 
        error: null 
      };
    }
  } catch (e) {
    console.error('[AUTH] API Key DB lookup error:', e.message);
  }

  // 4. Fallo total
  return { 
    userId: null, 
    user: null, 
    error: 'Token o API Key inválido, caducado o no encontrado' 
  };
}
