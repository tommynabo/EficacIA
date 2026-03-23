import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const envFile = readFileSync('./.env', 'utf8');
const get = (key) => envFile.split('\n').find(l => l.startsWith(key + '='))?.split('=').slice(1).join('=').trim();

const supabase = createClient(get('SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'));
const stripe = new Stripe(get('STRIPE_SECRET_KEY'));

const { data: users, error } = await supabase.from('users').select('id, email, stripe_id, subscription_status').limit(10);
if (error) { console.error('Supabase error:', error.message); process.exit(1); }
console.log('Users with stripe_id:');
for (const u of (users || [])) {
  if (u.stripe_id) {
    console.log(` - ${u.email} | stripe_id: ${u.stripe_id} | plan: ${u.subscription_status}`);
    // Try create portal session
    try {
      const s = await stripe.billingPortal.sessions.create({
        customer: u.stripe_id,
        return_url: 'https://eficac-ia.vercel.app/dashboard/settings?tab=billing',
      });
      console.log('   ✓ Portal OK:', s.url.slice(0, 50));
    } catch(e) {
      console.error('   ✗ Portal FAILED:', e.message);
    }
  } else {
    console.log(` - ${u.email} | NO stripe_id`);
  }
}
