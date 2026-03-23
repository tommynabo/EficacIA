import { readFileSync } from 'fs';
import Stripe from 'stripe';
const envFile = readFileSync('./.env', 'utf8');
const key = envFile.split('\n').find(l => l.startsWith('STRIPE_SECRET_KEY=')).split('=').slice(1).join('=').trim();
const stripe = new Stripe(key);
try {
  const config = await stripe.billingPortal.configurations.list({ limit: 3 });
  if (config.data.length === 0) {
    console.log('NO PORTAL CONFIG — portal not configured in Stripe Dashboard');
  } else {
    for (const c of config.data) {
      console.log('Config:', c.id, '| active:', c.active, '| default:', c.is_default);
    }
  }
} catch(e) { console.error('Stripe error:', e.message); }
