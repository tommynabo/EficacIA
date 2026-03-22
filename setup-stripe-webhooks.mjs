import Stripe from 'stripe';
import { config } from 'dotenv';
config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const EXISTING_V1_ID = 'we_1TDRWEBYhY8BKBRPiltzEknp';

// Update existing V1 webhook to include invoice.paid (required for 50% split)
const updated = await stripe.webhookEndpoints.update(EXISTING_V1_ID, {
  enabled_events: [
    'checkout.session.completed',
    'customer.subscription.deleted',
    'customer.subscription.updated',
    'invoice.payment_failed',
    'invoice.paid',
  ]
});
console.log('V1 webhook updated:', updated.id);
console.log('Events:\n  ', updated.enabled_events.join('\n  '));
console.log('Status:', updated.status);
