/**
 * /api/linkedin/campaign-engine
 *
 * Vercel Cron Job — runs every 2 minutes.
 * Processes active campaigns: finds leads whose next_action_at has passed,
 * executes the current sequence step, and schedules the next one.
 *
 * Flow:
 *  1. Find campaigns with status = 'active'
 *  2. For each campaign, find leads where next_action_at <= NOW
 *  3. Execute the step (invitation or message) via /api/linkedin/send-action
 *  4. Advance lead to next step and schedule next_action_at
 *
 * Security: Vercel cron calls include an Authorization header with CRON_SECRET.
 * Also callable manually with JWT auth for testing.
 */
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

function getUserId(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET || 'dev-secret').userId;
  } catch { return null; }
}

function verifyCron(req) {
  // Vercel sends CRON_SECRET in Authorization header for cron jobs
  const auth = req.headers.authorization;
  if (auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  // Also allow authenticated users (for manual trigger / test)
  return !!getUserId(req);
}

/**
 * Convert delay to milliseconds based on unit.
 */
function delayToMs(value, unit = 'days') {
  const multipliers = {
    minutes: 60 * 1000,
    hours: 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000,
    weeks: 7 * 24 * 60 * 60 * 1000,
  };
  return value * (multipliers[unit] || multipliers.days);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!verifyCron(req)) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const now = new Date().toISOString();
  console.log(`[ENGINE] Heartbeat: ${now}`);
  const stats = { campaigns: 0, processed: 0, errors: 0, skipped: 0 };

  try {
    // 1. Find active campaigns
    const { data: campaigns, error: campErr } = await supabaseAdmin
      .from('campaigns')
      .select('id, name, sequence, settings, team_id')
      .eq('status', 'active');

    if (campErr) {
      console.error('[ENGINE] Error fetching campaigns:', campErr.message);
      return res.status(500).json({ error: campErr.message });
    }

    if (!campaigns || campaigns.length === 0) {
      return res.status(200).json({ message: 'No hay campañas activas', stats });
    }

    stats.campaigns = campaigns.length;
    console.log(`[ENGINE] Processing ${campaigns.length} active campaign(s)`);

    for (const campaign of campaigns) {
      const sequence = campaign.sequence || [];
      if (sequence.length === 0) {
        console.log(`[ENGINE] Campaign ${campaign.id} has no sequence steps, skipping`);
        continue;
      }

      // Get the LinkedIn account for this campaign
      const accountIds = campaign.settings?.linkedin_account_ids || [];
      if (accountIds.length === 0) {
        console.log(`[ENGINE] Campaign ${campaign.id} has no LinkedIn account assigned, skipping`);
        continue;
      }
      const accountId = accountIds[0]; // Use first assigned account
      if (!accountId) {
        console.log(`[ENGINE] Campaign ${campaign.id} has an invalid or empty account assigned, skipping`);
        continue;
      }

      const dailyLimit = campaign.settings?.daily_limit_invitations || campaign.settings?.daily_limit_messages || 25;

      // Check how many actions we've done today for this campaign
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { count: todayCount } = await supabaseAdmin
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', campaign.id)
        .gte('last_action_at', todayStart.toISOString());

      if (todayCount >= dailyLimit) {
        console.log(`[ENGINE] Campaign ${campaign.id} hit daily limit (${todayCount}/${dailyLimit})`);
        continue;
      }

      const remaining = dailyLimit - (todayCount || 0);

      // 2. Find leads ready to process
      //    - sequence_status = 'active' AND next_action_at <= now
      //    - OR sequence_status = 'pending' (never started, first step)
      const { data: pendingLeads } = await supabaseAdmin
        .from('leads')
        .select('id, first_name, last_name, company, position, job_title, linkedin_url, email, custom_vars, current_step, sequence_status')
        .eq('campaign_id', campaign.id)
        .in('sequence_status', ['pending', 'active'])
        .lte('next_action_at', now)
        .limit(remaining);

      if (!pendingLeads || pendingLeads.length === 0) {
        // Check if all leads are completed
        const { count: activeCount } = await supabaseAdmin
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .eq('campaign_id', campaign.id)
          .in('sequence_status', ['pending', 'active']);

        if (activeCount === 0) {
          // All leads completed — mark campaign as completed
          await supabaseAdmin.from('campaigns').update({
            status: 'completed',
            ended_at: now,
            updated_at: now,
          }).eq('id', campaign.id);
          console.log(`[ENGINE] Campaign ${campaign.id} completed — all leads processed`);
        }
        continue;
      }

      console.log(`[ENGINE] Campaign "${campaign.name}": ${pendingLeads.length} lead(s) to process`);

      // 3. Process each lead
      for (const lead of pendingLeads) {
        const stepIndex = lead.current_step || 0;
        const step = sequence[stepIndex];

        if (!step) {
          // Lead has completed all steps
          await supabaseAdmin.from('leads').update({
            sequence_status: 'completed',
            current_step: stepIndex,
          }).eq('id', lead.id);
          stats.skipped++;
          continue;
        }

        try {
          // Call send-action internally
          const protocol = req.headers['x-forwarded-proto'] || 'https';
          const host = req.headers.host;
          const sendRes = await fetch(`${protocol}://${host}/api/linkedin/send-action`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-engine-key': process.env.JWT_SECRET || 'dev-secret',
            },
            body: JSON.stringify({
              leadId: lead.id,
              accountId,
              actionType: step.type,
              content: step.content || '',
              campaignId: campaign.id,
              campaignName: campaign.name,
            }),
          });

          if (!sendRes.ok) {
            const errData = await sendRes.json().catch(() => ({}));
            const errMsg = errData.error || `Error ${sendRes.status}`;
            console.error(`[ENGINE] Failed to process lead ${lead.id}: ${errMsg}`);
            
            // Mark lead as failed in DB to avoid constant retries if the error is permanent
            await supabaseAdmin.from('leads').update({
              sequence_status: 'failed',
              error_message: errMsg,
              last_action_at: now
            }).eq('id', lead.id);

            stats.errors++;
            continue;
          }

          // 4. Advance to next step and schedule
          const nextStepIndex = stepIndex + 1;
          const nextStep = sequence[nextStepIndex];

          if (nextStep) {
            // Calculate when the next step should fire
            const delayMs = delayToMs(nextStep.delayDays || 1, nextStep.delayUnit || 'days');
            const nextActionAt = new Date(Date.now() + delayMs).toISOString();

            await supabaseAdmin.from('leads').update({
              current_step: nextStepIndex,
              sequence_status: 'active',
              next_action_at: nextActionAt,
            }).eq('id', lead.id);

            console.log(`[ENGINE] Lead ${lead.first_name}: step ${stepIndex} done → next at ${nextActionAt}`);
          } else {
            // All steps completed
            await supabaseAdmin.from('leads').update({
              current_step: nextStepIndex,
              sequence_status: 'completed',
              next_action_at: null,
            }).eq('id', lead.id);
            console.log(`[ENGINE] Lead ${lead.first_name}: sequence completed`);
          }

          stats.processed++;

          // Add jitter between sends (1-3 seconds) to look human
          await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));

        } catch (err) {
          console.error(`[ENGINE] Error processing lead ${lead.id}:`, err.message);
          stats.errors++;
        }
      }

      // Update campaign stats
      const { count: sentCount } = await supabaseAdmin
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', campaign.id)
        .eq('sent_message', true);

      await supabaseAdmin.from('campaigns').update({
        sent_count: sentCount || 0,
        updated_at: now,
        settings: {
          ...campaign.settings,
          last_heartbeat_at: now
        }
      }).eq('id', campaign.id);
    }

    console.log(`[ENGINE] Done:`, stats);
    return res.status(200).json({ success: true, stats });

  } catch (err) {
    console.error('[ENGINE] Fatal error:', err.message);
    return res.status(500).json({ error: err.message, stats });
  }
}
