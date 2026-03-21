import { Router, Request, Response } from 'express'
import Stripe from 'stripe'
import { supabase } from '../lib/supabase.js'
import { authMiddleware } from '../middleware/index.js'
import { config } from '../config/index.js'

const router = Router()
const stripe = new Stripe(config.STRIPE_SECRET_KEY)

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
 * POST /api/payments/create-checkout-session
 * Crea una sesión de Stripe Checkout para el trial de 7 días
 * NO requiere autenticación - el usuario aún no tiene cuenta
 */
router.post('/create-checkout-session', async (req: Request, res: Response) => {
  try {
    const { plan } = req.body

    if (!plan || !PLANS[plan as keyof typeof PLANS]) {
      return res.status(400).json({ error: 'Plan inválido. Usa "starter" o "pro".' })
    }

    const planConfig = PLANS[plan as keyof typeof PLANS]
    const baseUrl = req.headers.origin || process.env.FRONTEND_URL || 'http://localhost:5173'

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      // By omitting payment_method_types, Stripe automatically uses all methods active in the Dashboard
      // including Apple Pay, Google Pay, SEPA Direct Debit, etc.
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
      // Recoger datos del cliente
      customer_creation: 'always',
      billing_address_collection: 'auto',
      // Campos personalizados no necesarios — Stripe recoge email y nombre automáticamente
      success_url: `${baseUrl}/register?session_id={CHECKOUT_SESSION_ID}&plan=${plan}`,
      cancel_url: `${baseUrl}/pricing`,
    })

    res.json({
      sessionId: session.id,
      url: session.url,
    })
  } catch (error: any) {
    console.error('Checkout session error:', error)
    res.status(500).json({ error: error.message || 'Error creando sesión de checkout' })
  }
})

/**
 * GET /api/payments/checkout-session/:sessionId
 * Recupera datos del cliente desde la sesión de Stripe Checkout
 * Se usa para pre-rellenar el formulario de registro
 */
router.get('/checkout-session/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['customer', 'subscription'],
    })

    if (session.status !== 'complete') {
      return res.status(400).json({ error: 'Sesión no completada' })
    }

    // Extrae datos del cliente
    const customer = session.customer as Stripe.Customer
    const subscription = session.subscription as Stripe.Subscription

    res.json({
      email: customer?.email || session.customer_details?.email || '',
      name: customer?.name || session.customer_details?.name || '',
      customerId: typeof session.customer === 'string' ? session.customer : customer?.id,
      subscriptionId: typeof session.subscription === 'string' ? session.subscription : subscription?.id,
      plan: session.metadata?.plan || '',
    })
  } catch (error: any) {
    console.error('Retrieve checkout session error:', error)
    res.status(500).json({ error: error.message || 'Error recuperando sesión' })
  }
})

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
    // @ts-ignore-next-line
    const { data: userRaw, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()

    const user = userRaw as any;

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

      // @ts-ignore-next-line
      await supabase
        .from('users')
        // @ts-ignore-next-line
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

    // @ts-ignore-next-line
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
