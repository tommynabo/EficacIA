/** CORS headers for Vercel serverless functions */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

/** Stripe plan config */
export const PLANS = {
  starter: {
    name: 'Starter',
    priceId: 'price_1T6w3Y2dSOGFvDre1P8c2t4L',
    price: 4999,
    currency: 'eur',
    features: ['Hasta 500 leads/mes', 'Búsqueda en LinkedIn', '1 campaña activa', 'Soporte por email'],
    trial_days: 7,
  },
  pro: {
    name: 'Pro',
    priceId: 'price_1T6w3Z2dSOGFvDrePckW6jYJ',
    price: 8499,
    currency: 'eur',
    features: ['Leads ilimitados', 'Automatización completa', 'Campañas ilimitadas', 'API access', 'Soporte prioritario'],
    trial_days: 7,
  },
} as const
