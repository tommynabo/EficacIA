
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

async function check() {
  console.log('--- Campaign Info ---');
  const { data: campaigns, error: cErr } = await supabase
    .from('campaigns')
    .select('id, name, settings, team_id')
    .ilike('name', '%Consultores SEO%');

  if (cErr) {
    console.error('Error fetching campaigns:', cErr);
    return;
  }

  if (!campaigns || campaigns.length === 0) {
    console.log('No campaign found with name like "Consultores SEO"');
    return;
  }

  for (const campaign of campaigns) {
    console.log(`Campaign: ${campaign.name} (${campaign.id})`);
    console.log('Settings:', JSON.stringify(campaign.settings, null, 2));
    
    const accountIds = campaign.settings?.linkedin_account_ids || [];
    console.log('Account IDs in settings:', accountIds);

    if (accountIds.length > 0) {
      console.log('\n--- Profiles matching these IDs (by UUID id) ---');
      const { data: accountsById } = await supabase
        .from('linkedin_accounts')
        .select('id, unipile_account_id, profile_name, username')
        .in('id', accountIds);
      console.log('Accounts by id:', accountsById);

      console.log('\n--- Profiles matching these IDs (by unipile_account_id) ---');
      const { data: accountsByUnipile } = await supabase
        .from('linkedin_accounts')
        .select('id, unipile_account_id, profile_name, username')
        .in('unipile_account_id', accountIds);
      console.log('Accounts by unipile_account_id:', accountsByUnipile);
    }
  }

  console.log('\n--- Recent LinkedIn Accounts (last 5) ---');
  const { data: recentAccounts } = await supabase
    .from('linkedin_accounts')
    .select('id, unipile_account_id, profile_name, username, created_at')
    .order('created_at', { ascending: false })
    .limit(5);
  console.log('Recent accounts:', recentAccounts);
}

check();
