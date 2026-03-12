import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

async function test() {
  const { data: leads } = await supabaseAdmin.from('leads').select('*').in('first_name', ['Tony', 'Loreto', 'Gonzalo']);
  console.log("Leads:", JSON.stringify(leads, null, 2));
}

test();
