import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const envFile = readFileSync('./.env', 'utf8');
const get = (key) => envFile.split('\n').find(l => l.startsWith(key + '='))?.split('=').slice(1).join('=').trim();

const supabase = createClient(get('SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'));

// Find tomasnivraone@gmail.com user
const { data: user, error } = await supabase
  .from('users')
  .select('id, email, stripe_customer_id, subscription_status, subscription_plan')
  .eq('email', 'tomasnivraone@gmail.com')
  .maybeSingle();

if (error) { console.error('Error:', error.message); process.exit(1); }
if (!user) { console.log('User not found'); process.exit(1); }

console.log('Current user record:');
console.log('  id:', user.id);
console.log('  stripe_customer_id:', user.stripe_customer_id);
console.log('  subscription_status:', user.subscription_status);
console.log('  subscription_plan:', user.subscription_plan);

if (user.stripe_customer_id) {
  console.log('\nstripe_customer_id already set — no update needed');
  process.exit(0);
}

// Link the known Stripe customer ID
const { error: updateErr } = await supabase
  .from('users')
  .update({ stripe_customer_id: 'cus_UCCiRv1SVIKpMz' })
  .eq('id', user.id);

if (updateErr) { console.error('Update error:', updateErr.message); process.exit(1); }
console.log('\n✓ Linked stripe_customer_id = cus_UCCiRv1SVIKpMz to user', user.id);
