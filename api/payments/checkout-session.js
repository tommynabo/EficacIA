const Stripe = require('stripe');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      return res.status(500).json({ error: 'Stripe secret key not configured' });
    }

    const stripe = new Stripe(secretKey);
    const sessionId = req.query.sessionId;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId es requerido' });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['customer', 'subscription'],
    });

    if (session.status !== 'complete') {
      return res.status(400).json({ error: 'Sesión no completada' });
    }

    const customer = session.customer;
    return res.status(200).json({
      email: (customer && customer.email) || (session.customer_details && session.customer_details.email) || '',
      name: (customer && customer.name) || (session.customer_details && session.customer_details.name) || '',
      customerId: typeof session.customer === 'string' ? session.customer : (customer && customer.id),
      subscriptionId: typeof session.subscription === 'string' ? session.subscription : (session.subscription && session.subscription.id),
      plan: (session.metadata && session.metadata.plan) || '',
    });
  } catch (error) {
    console.error('Checkout session retrieve error:', error);
    return res.status(500).json({ error: error.message || 'Error recuperando sesión' });
  }
};
