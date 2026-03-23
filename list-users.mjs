import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const envFile = readFileSync('./.env', 'utf8');
const get = (key) => envFile.split('\n').find(l => l.startsWith(key + '='))?.split('=').slice(1).join('=').trim();

const supabase = createClient(get('SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'));

const { data: users, error } = await supabase
  .from('users')
  .select('id, email, stripe_customer_id, subscription_status')
  .limit(20);

if (error) { console.error('Error:', error.message); process.exit(1); }
console.log('All users:');
for (const u of users) {
  console.log(`  ${u.email} | stripe_customer_id: ${u.stripe_customer_id || 'NULL'} | status: ${u.subscription_status}`);
}
