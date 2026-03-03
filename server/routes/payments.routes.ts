import { Router, Request, Response } from 'express'
import Stripe from 'stripe'
import { supabase } from '../lib/supabase.js'
import { authMiddleware } from '../middleware/index.js'
import { config } from '../config/index.js'

const router = Router()
const stripe = new Stripe(config.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' })

/**
 * PLANES DISPONIBLES
 */
const PLANS = {
  starter: {
    name: 'Starter',
    price: 2999, // $29.99
    currency: 'usd',
    features: ['Hasta 100 leads', 'Campañas básicas', 'Soporte por email'],
    metadata: { plan: 'starter', trial_days: 7 },
  },
  pro: {
    name: 'Pro',
    price: 7999, // $79.99
    currency: 'usd',
    features: ['Leads ilimitados', 'Campañas avanzadas', 'LinkedIn automation', 'Soporte prioritario'],
    metadata: { plan: 'pro', trial_days: 7 },
  },
  enterprise: {
    name: 'Enterprise',
    price: 29999, // $299.99
    currency: 'usd',
    features: ['Todo en Pro', 'API access', 'Webhook personalizado', 'Soporte 24/7'],
    metadata: { plan: 'enterprise', trial_days: 14 },
  },
}

/**
 * POST /api/payments/create-payment-intent
 * Crea un PaymentIntent para checkout
 */
router.post('/create-payment-intent', authMiddleware, async (req: Request, res: Response) => {
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

    // Crea o obtiene customer de Stripe
    let customerId = user.stripe_customer_id

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId },
      })
      customerId = customer.id

      // Actualiza usuario con stripe_customer_id
      await supabase
        .from('users')
        .update({ stripe_customer_id: customerId })
        .eq('id', userId)
    }

    // Crea PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: planConfig.price,
      currency: planConfig.currency,
      customer: customerId,
      metadata: {
        userId,
        plan,
        ...planConfig.metadata,
      },
      description: `${planConfig.name} Plan - 7 days free trial`,
    })

    res.json({
      clientSecret: paymentIntent.client_secret,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    })
  } catch (error: any) {
    console.error('Payment intent error:', error)
    res.status(500).json({ error: error.message || 'Error creando payment intent' })
  }
})

/**
 * POST /api/payments/create-subscription
 * Crea una suscripción directamente (usa si tienes tarjeta guardada)
 */
router.post('/create-subscription', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.userId
    const { plan, paymentMethodId } = req.body

    if (!plan || !PLANS[plan as keyof typeof PLANS]) {
      return res.status(400).json({ error: 'Plan inválido' })
    }

    const planConfig = PLANS[plan as keyof typeof PLANS]

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
        payment_method: paymentMethodId,
        invoice_settings: { default_payment_method: paymentMethodId },
      })
      customerId = customer.id

      await supabase
        .from('users')
        .update({ stripe_customer_id: customerId })
        .eq('id', userId)
    }

    // Crea una suscripción con trial de 7 días
    const trialDays = planConfig.metadata.trial_days
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price_data: { currency: planConfig.currency, product_data: { name: planConfig.name }, unit_amount: planConfig.price, recurring: { interval: 'month' } } }],
      trial_period_days: trialDays,
      metadata: { userId, plan },
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
      subscription,
      message: `Trial de ${trialDays} días activado`,
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
 * Webhook de Stripe - Procesa eventos
 */
router.post('/stripe-webhook', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string

  try {
    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      config.STRIPE_WEBHOOK_SECRET
    )

    console.log(`Stripe event: ${event.type}`)

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        const userId = paymentIntent.metadata?.userId
        const plan = paymentIntent.metadata?.plan
        const trialDays = parseInt(paymentIntent.metadata?.trial_days || '7')

        if (userId && plan) {
          const trialEndsAt = new Date()
          trialEndsAt.setDate(trialEndsAt.getDate() + trialDays)

          await supabase.from('users').update({
            subscription_plan: plan,
            subscription_status: 'active',
            trial_ends_at: trialEndsAt.toISOString(),
          }).eq('id', userId)

          console.log(`✓ Payment succeeded for user ${userId}, plan: ${plan}`)
        }
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const userId = subscription.metadata?.userId

        if (userId) {
          let status = 'active'
          if (subscription.status === 'past_due') status = 'past_due'
          if (subscription.pause_at) status = 'paused'

          await supabase.from('users').update({
            subscription_status: status,
          }).eq('id', userId)
        }
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const userId = subscription.metadata?.userId

        if (userId) {
          await supabase.from('users').update({
            subscription_status: 'canceled',
            subscription_plan: 'free',
          }).eq('id', userId)

          console.log(`✓ Subscription canceled for user ${userId}`)
        }
        break
      }

      case 'charge.failed': {
        const charge = event.data.object as Stripe.Charge
        console.error(`✗ Charge failed: ${charge.id} - ${charge.failure_message}`)
        break
      }

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    res.json({ received: true })
  } catch (error: any) {
    console.error('Webhook error:', error)
    res.status(400).json({ error: `Webhook Error: ${error.message}` })
  }
})

export default router
