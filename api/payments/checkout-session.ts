import type { VercelRequest, VercelResponse } from '@vercel/node'
import Stripe from 'stripe'
import { corsHeaders } from '../_lib/utils'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-04-10' as any })

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    return res.status(200).end()
  }

  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v))

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { sessionId } = req.query

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'sessionId es requerido' })
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['customer', 'subscription'],
    })

    if (session.status !== 'complete') {
      return res.status(400).json({ error: 'Sesión no completada' })
    }

    const customer = session.customer as Stripe.Customer
    const subscription = session.subscription as Stripe.Subscription

    return res.status(200).json({
      email: customer?.email || session.customer_details?.email || '',
      name: customer?.name || session.customer_details?.name || '',
      customerId: typeof session.customer === 'string' ? session.customer : customer?.id,
      subscriptionId: typeof session.subscription === 'string' ? session.subscription : subscription?.id,
      plan: session.metadata?.plan || '',
    })
  } catch (error: any) {
    console.error('Retrieve checkout session error:', error)
    return res.status(500).json({ error: error.message || 'Error recuperando sesión' })
  }
}
