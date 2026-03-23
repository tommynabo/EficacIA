import Stripe from 'stripe';
import { readFileSync } from 'fs';

// Load .env manually
const envFile = readFileSync('./.env', 'utf8');
const envKey = envFile.split('\n').find(l => l.startsWith('STRIPE_SECRET_KEY='));
const stripeKey = envKey?.split('=').slice(1).join('=').trim();

if (!stripeKey) { console.error('No STRIPE_SECRET_KEY found'); process.exit(1); }

const stripe = new Stripe(stripeKey);

const customers = await stripe.customers.list({ email: 'ceo@thegrowthcrafter.com', limit: 5 });

if (!customers.data.length) {
  console.log('No customer found for ceo@thegrowthcrafter.com');
  process.exit(0);
}

for (const c of customers.data) {
  console.log('=== CUSTOMER ===');
  console.log('id:', c.id);
  console.log('email:', c.email);
  console.log('metadata:', JSON.stringify(c.metadata, null, 2));

  const subs = await stripe.subscriptions.list({ customer: c.id, limit: 10 });
  for (const s of subs.data) {
    console.log('\n=== SUBSCRIPTION', s.id, '===');
    console.log('status:', s.status);
    console.log('metadata:', JSON.stringify(s.metadata, null, 2));
  }
}
