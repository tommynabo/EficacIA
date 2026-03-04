import type { VercelRequest, VercelResponse } from '@vercel/node'
import Stripe from 'stripe'
import { corsHeaders, PLANS } from '../_lib/utils'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-04-10' as any })

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    return res.status(200).end()
  }

  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v))

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { plan } = req.body

    if (!plan || !PLANS[plan as keyof typeof PLANS]) {
      return res.status(400).json({ error: 'Plan inválido. Usa "starter" o "pro".' })
    }

    const planConfig = PLANS[plan as keyof typeof PLANS]

    // Determine base URL from request headers or env
    const proto = req.headers['x-forwarded-proto'] || 'https'
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:5173'
    const baseUrl = process.env.FRONTEND_URL || `${proto}://${host}`

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: planConfig.priceId,
          quantity: 1,
        },
      ],
      subscription_data: {
        trial_period_days: planConfig.trial_days,
        metadata: { plan },
      },
      metadata: { plan },
      customer_creation: 'always',
      billing_address_collection: 'auto',
      success_url: `${baseUrl}/register?session_id={CHECKOUT_SESSION_ID}&plan=${plan}`,
      cancel_url: `${baseUrl}/pricing`,
    })

    return res.status(200).json({
      sessionId: session.id,
      url: session.url,
    })
  } catch (error: any) {
    console.error('Checkout session error:', error)
    return res.status(500).json({ error: error.message || 'Error creando sesión de checkout' })
  }
}
