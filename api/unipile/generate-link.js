import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

// Variables de entorno necesarias:
// UNIPILE_DSN        → Tu DSN de Unipile (ej: "api1.unipile.com:13443")
// UNIPILE_API_KEY    → Tu API Key de Unipile (desde el dashboard)
// SUPABASE_URL       → URL de tu proyecto Supabase
// SUPABASE_SERVICE_ROLE_KEY → Clave de servicio de Supabase
// JWT_SECRET         → Secreto para verificar tokens JWT

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

/**
 * Extrae y verifica el userId del token JWT en el header Authorization.
 */
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

/**
 * POST /api/unipile/generate-link
 * 
 * Genera un "Hosted Auth Link" de Unipile para que el usuario
 * conecte su cuenta de LinkedIn de forma segura.
 * 
 * Unipile se encarga de todo: credenciales, 2FA, proxies, anti-ban.
 * Nosotros solo recibimos el account_id por webhook cuando termine.
 */
export default async function handler(req, res) {
  // Solo aceptar POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    // 1. Verificar autenticación
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'No autenticado. Inicia sesión primero.' });
    }

    // 2. Verificar que el usuario existe en la base de datos
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, email')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    // 3. Construir la URL de la API de Unipile
    const unipileDsn = process.env.UNIPILE_DSN;
    const unipileApiKey = process.env.UNIPILE_API_KEY;

    if (!unipileDsn || !unipileApiKey) {
      console.error('[UNIPILE] Faltan variables de entorno UNIPILE_DSN o UNIPILE_API_KEY');
      return res.status(500).json({ error: 'Error de configuración del servidor. Contacta al administrador.' });
    }

    // 4. Llamar a la API de Unipile para generar el Hosted Auth Link
    // Documentación: https://developer.unipile.com/reference/create-hosted-account-link
    const unipileUrl = `https://${unipileDsn}/api/v1/hosted/accounts/link`;

    // notify_url es donde Unipile redirige al usuario tras completar el login
    // expiresOn: el link expira en 30 minutos
    const expiresOn = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    // La URL de callback tras completar el flujo (vuelve a nuestra app)
    const successRedirectUrl = (process.env.FRONTEND_URL || 'http://localhost:5173') 
      + '/dashboard/accounts?unipile=success';

    const response = await fetch(unipileUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-API-KEY': unipileApiKey,
      },
      body: JSON.stringify({
        type: 'create',
        // Proveedor: LinkedIn
        providers: ['LINKEDIN'],
        // Identificador externo: nuestro user_id para vincular en el webhook
        externalId: userId,
        // URL de redirección tras éxito
        notify_url: successRedirectUrl,
        // Nombre para identificar en el dashboard de Unipile
        name: user.email,
        // Expiración del link
        expiresOn: expiresOn,
        // API Url: nuestro webhook para recibir notificaciones
        api_url: (process.env.VERCEL_URL 
          ? `https://${process.env.VERCEL_URL}` 
          : process.env.FRONTEND_URL || 'http://localhost:3001')
          + '/api/webhooks/unipile',
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('[UNIPILE] Error al generar link:', response.status, errorBody);
      return res.status(502).json({ 
        error: 'No se pudo generar el enlace de conexión. Inténtalo de nuevo.' 
      });
    }

    const data = await response.json();

    // 5. Devolver la URL del hosted link al frontend
    // Unipile devuelve { url: "https://..." } con el link seguro
    if (!data.url) {
      console.error('[UNIPILE] Respuesta sin URL:', JSON.stringify(data));
      return res.status(502).json({ 
        error: 'Respuesta inesperada de Unipile. Inténtalo de nuevo.' 
      });
    }

    console.log(`[UNIPILE] Link generado para usuario ${userId}`);

    return res.status(200).json({ 
      url: data.url,
      message: 'Enlace de conexión generado correctamente.' 
    });

  } catch (err) {
    console.error('[UNIPILE] Error interno:', err);
    return res.status(500).json({ 
      error: 'Error interno del servidor. Inténtalo más tarde.' 
    });
  }
}
