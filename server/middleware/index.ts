import { Request, Response, NextFunction } from 'express';
import { verifyJWT } from '../lib/utils.js';
import { supabaseAdmin } from '../lib/supabase.js';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      email?: string;
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No authorization token' });
    }

    const token = authHeader.substring(7);

    // 1. System Admin B2B
    if (token === process.env.API_SECRET_KEY) {
      req.userId = 'system';
      return next();
    }

    // 2. Lifetime Extension Token — looked up in DB, never expires
    const { data: userWithToken } = await (supabaseAdmin as any)
      .from('users')
      .select('id')
      .eq('extension_token', token)
      .single();

    if (userWithToken) {
      req.userId = userWithToken.id;
      return next();
    }

    // 3. Fallback: Web JWT (dashboard sessions)
    const decoded = verifyJWT(token);

    if (!decoded) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.userId = decoded.userId;
    req.email = decoded.email;

    if (!req.userId) {
      return res.status(401).json({ error: 'Invalid token payload: missing user ID' });
    }

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
}

export function errorHandler(
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.error('Error:', error);

  if (error.status) {
    return res.status(error.status).json({
      error: error.message || 'An error occurred',
      details: error.details,
    });
  }

  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : undefined,
  });
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    error: 'Route not found',
    path: req.path,
  });
}
