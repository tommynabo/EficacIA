import { Router, Request, Response } from 'express'
import Stripe from 'stripe'
import { supabase } from '../lib/supabase.js'
import { authMiddleware } from '../middleware/index.js'
import { config } from '../config/index.js'

const router = Router()
const stripe = new Stripe(config.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' })

/**
 * PLANES DISPONIBLES - Usando Stripe Product & Price IDs
 */
const PLANS = {
  starter: {
    name: 'Starter',
    priceId: 'price_1T6w3Y2dSOGFvDre1P8c2t4L', // €49.99/mes
    price: 4999,
    currency: 'eur',
    features: ['Hasta 500 leads/mes', 'Búsqueda en LinkedIn', '1 campaña activa', 'Soporte por email'],
    trial_days: 7,
  },
  pro: {
    name: 'Pro',
    priceId: 'price_1T6w3Z2dSOGFvDrePckW6jYJ', // €84.99/mes
    price: 8499,
    currency: 'eur',
    features: ['Leads ilimitados', 'Automatización completa', 'Campañas ilimitadas', 'API access', 'Soporte prioritario'],
    trial_days: 7,
  },
}

/**
 * POST /api/payments/create-payment-intent
 * DEPRECATED - Use create-subscription instead
 * Mantiene compatibilidad pero redirige a create-subscription
 */
router.post('/create-payment-intent', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.userId
    const { plan } = req.body

    if (!plan || !PLANS[plan as keyof typeof PLANS]) {
      return res.status(400).json({ error: 'Plan inválido' })
    }

    const planConfig = PLANS[plan as keyof typeof PLANS]

    // Retorna la información necesaria para el checkout
    res.json({
      priceId: planConfig.priceId,
      planName: planConfig.name,
      amount: planConfig.price,
      currency: planConfig.currency,
      trialDays: planConfig.trial_days,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    })
  } catch (error: any) {
    console.error('Payment intent error:', error)
    res.status(500).json({ error: error.message || 'Error creando payment intent' })
  }
})

/**
 * POST /api/payments/create-subscription
 * Crea una suscripción con Stripe Price ID (7 días gratis)
 */
router.post('/create-subscription', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.userId
    const { plan } = req.body

    if (!plan || !PLANS[plan as keyof typeof PLANS]) {
      return res.status(400).json({ error: 'Plan inválido' })
    }

    const planConfig = PLANS[plan as keyof typeof PLANS]

    // Obtiene usuario
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()

    if (userError || !user) {
      return res.status(404).json({ error: 'Usuario no encontrado' })
    }

    // Crea customer si no existe
    let customerId = user.stripe_customer_id
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId },
      })
      customerId = customer.id

      await supabase
        .from('users')
        .update({ stripe_customer_id: customerId })
        .eq('id', userId)
    }

    // Crea suscripción con trial de 7 días
    const trialDays = planConfig.trial_days
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [
        {
          price: planConfig.priceId,
        },
      ],
      trial_period_days: trialDays,
      payment_settings: {
        save_default_payment_method: 'on_subscription',
      },
      metadata: {
        userId,
        plan,
      },
    })

    // Actualiza usuario en Supabase
    const trialEndsAt = new Date()
    trialEndsAt.setDate(trialEndsAt.getDate() + trialDays)

    await supabase.from('users').update({
      stripe_subscription_id: subscription.id,
      subscription_plan: plan,
      subscription_status: 'trial',
      trial_ends_at: trialEndsAt.toISOString(),
    }).eq('id', userId)

    res.json({
      success: true,
      subscription: {
        id: subscription.id,
        plan,
        status: subscription.status,
        trial_ends_at: trialEndsAt,
      },
      message: `✓ Prueba de ${trialDays} días activada. Se cobrará €${(planConfig.price / 100).toFixed(2)} después.`,
    })
  } catch (error: any) {
    console.error('Subscription error:', error)
    res.status(500).json({ error: error.message || 'Error creando suscripción' })
  }
})

/**
 * GET /api/payments/plans
 * Obtiene todos los planes disponibles
 */
router.get('/plans', (req: Request, res: Response) => {
  const plansArray = Object.entries(PLANS).map(([key, value]) => ({
    id: key,
    ...value,
  }))
  res.json(plansArray)
})

/**
 * GET /api/payments/subscription
 * Obtiene la suscripción activa del usuario
 */
router.get('/subscription', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.userId

    const { data: user, error } = await supabase
      .from('users')
      .select('subscription_plan, subscription_status, stripe_subscription_id, trial_ends_at')
      .eq('id', userId)
      .single()

    if (error) {
      return res.status(404).json({ error: 'Usuario no encontrado' })
    }

    res.json(user)
  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo suscripción' })
  }
})

/**
 * POST /api/webhooks/stripe
 * Webhook is handled in server/index.ts to manage raw body before JSON parser
 * This endpoint is deprecated - use /api/payments/stripe-webhook instead
 */
router.post('/stripe-webhook', (req: Request, res: Response) => {
  res.status(404).json({ error: 'Use POST /api/payments/stripe-webhook instead' })
})

export default router
