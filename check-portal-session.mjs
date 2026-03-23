import { readFileSync } from 'fs';
import Stripe from 'stripe';
const envFile = readFileSync('./.env', 'utf8');
const key = envFile.split('\n').find(l => l.startsWith('STRIPE_SECRET_KEY=')).split('=').slice(1).join('=').trim();
const stripe = new Stripe(key);
try {
  // Use the known customer ID from previous investigation
  const session = await stripe.billingPortal.sessions.create({
    customer: 'cus_UCCiRv1SVIKpMz',
    return_url: 'https://eficac-ia.vercel.app/dashboard/settings?tab=billing',
  });
  console.log('SUCCESS! Portal URL:', session.url.slice(0, 80) + '...');
} catch(e) {
  console.error('Stripe error type:', e.type);
  console.error('Stripe error code:', e.code);
  console.error('Stripe error message:', e.message);
}
