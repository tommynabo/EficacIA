import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Server
  PORT: Number(process.env.PORT) || 3001,
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // Supabase
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_KEY: process.env.SUPABASE_KEY || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  
  // Redis
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  
  // Claude AI
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  
  // Stripe
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || '',
  
  // Frontend
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
  VITE_API_URL: process.env.VITE_API_URL || 'http://localhost:3001',
  
  // JWT
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-key',
  JWT_EXPIRY: '7d',
  
  // LinkedIn
  LINKEDIN_SESSION_VALIDATION_ENDPOINT: process.env.LINKEDIN_SESSION_VALIDATION_ENDPOINT || 'https://www.linkedin.com/feed/',
  
  // Proxies
  BRIGHT_DATA_API_KEY: process.env.BRIGHT_DATA_API_KEY,
  
  // Limits
  LINKEDIN_DAILY_LIMIT: 25, // Límite conservador de conexiones por día
  LINKEDIN_HOURLY_LIMIT: 5,
  MIN_DELAY_BETWEEN_ACTIONS_MS: 2000,
  MAX_DELAY_BETWEEN_ACTIONS_MS: 8000,
  
  // Scraping timeout (ms)
  PLAYWRIGHT_TIMEOUT: 30000,
  DEFAULT_NAVIGATION_TIMEOUT: 30000,
};

export default config;
