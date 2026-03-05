import Stripe from 'stripe';

const PLANS = {
  starter: {
    priceId: 'price_1T6w3Y2dSOGFvDre1P8c2t4L',
    trial_days: 7,
  },
  pro: {
    priceId: 'price_1T6w3Z2dSOGFvDrePckW6jYJ',
    trial_days: 7,
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET — recuperar sesión completada por sessionId
  if (req.method === 'GET') {
    try {
      const secretKey = process.env.STRIPE_SECRET_KEY;
      if (!secretKey) return res.status(500).json({ error: 'Stripe secret key not configured' });
      const stripe = new Stripe(secretKey);
      const sessionId = req.query.sessionId;
      if (!sessionId) return res.status(400).json({ error: 'sessionId es requerido' });
      const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['customer', 'subscription'] });
      if (session.status !== 'complete') return res.status(400).json({ error: 'Sesión no completada' });
      const customer = session.customer;
      return res.status(200).json({
        email: (customer && customer.email) || session.customer_details?.email || '',
        name: (customer && customer.name) || session.customer_details?.name || '',
        customerId: typeof session.customer === 'string' ? session.customer : customer?.id,
        subscriptionId: typeof session.subscription === 'string' ? session.subscription : session.subscription?.id,
        plan: session.metadata?.plan || '',
      });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Error recuperando sesión' });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      return res.status(500).json({ error: 'Stripe secret key not configured' });
    }

    const stripe = new Stripe(secretKey);
    const { plan } = req.body || {};

    if (!plan || !PLANS[plan]) {
      return res.status(400).json({ error: 'Plan inválido. Usa "starter" o "pro".' });
    }

    const planConfig = PLANS[plan];
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const baseUrl = `${proto}://${host}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: planConfig.priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: planConfig.trial_days,
        metadata: { plan },
      },
      metadata: { plan },
      billing_address_collection: 'auto',
      success_url: `${baseUrl}/register?session_id={CHECKOUT_SESSION_ID}&plan=${plan}`,
      cancel_url: `${baseUrl}/pricing`,
    });

    return res.status(200).json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Checkout error:', error);
    return res.status(500).json({ error: error.message || 'Error creando sesión' });
  }
};
