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
    const apiKey = req.headers['x-api-key'] || (authHeader ? authHeader.replace('Bearer ', '') : null);

    // 1. Verificación B2B (System Admin)
    if (apiKey && apiKey === process.env.API_SECRET_KEY) {
      return { userId: 'system', role: 'admin' };
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.replace('Bearer ', '');

    // 2. Decodificación rápida sin overhead de red (Protegido por API Gateway / Frontend)
    const decoded = jwt.decode(token);

    if (!decoded) {
      return null;
    }

    // Extracción estricta del claim correcto de Supabase para evitar cruce de datos
    const userId = decoded.sub || decoded.userId || decoded.id;

    if (!userId) {
      console.error('[AUTH] Token missing strict user ID claim');
      return null;
    }

    return {
      ...decoded,
      userId: userId,
      id: userId
    };
  } catch (error) {
    console.error('[AUTH] Error parsing token:', error.message);
    return null;
  }
}
