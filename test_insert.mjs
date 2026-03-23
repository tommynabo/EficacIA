import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

async function test() {
  await supabaseAdmin.from('leads').delete().eq('id', '1e74b5f1-9e6a-4d97-ad0b-f6c01506f7f6');
  console.log("Deleted test lead.");
}

test();
