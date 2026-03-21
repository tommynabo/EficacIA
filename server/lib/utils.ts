import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

export function generateJWT(userId: string, email: string): string {
  const options = { expiresIn: config.JWT_EXPIRY } as const;
  return jwt.sign(
    { userId, email },
    config.JWT_SECRET as string,
    options as any
  );
}

export function verifyJWT(token: string): { userId: string; email: string } | null {
  try {
    return jwt.verify(token, config.JWT_SECRET) as { userId: string; email: string };
  } catch (error) {
    return null;
  }
}

export function generateRandomDelay(minMs: number, maxMs: number): number {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function validateLinkedInSession(sessionCookie: string): Promise<boolean> {
  try {
    // This is a placeholder - in production, you'd use Playwright to validate
    // by actually checking if the session works with LinkedIn
    return !!sessionCookie;
  } catch (error) {
    return false;
  }
}

export function sanitizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    // Remove query parameters for cleaner storage
    return urlObj.origin + urlObj.pathname;
  } catch {
    return url;
  }
}
