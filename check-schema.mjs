import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const envFile = readFileSync('./.env', 'utf8');
const get = (key) => envFile.split('\n').find(l => l.startsWith(key + '='))?.split('=').slice(1).join('=').trim();

const supabase = createClient(get('SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'));

const { data: row, error } = await supabase.from('users').select('*').limit(1).maybeSingle();
if (error) { console.error('Error:', error.message); }
else { console.log('User row keys:', Object.keys(row || {})); }
