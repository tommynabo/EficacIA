// /api/cron/temperature-analysis
//
// Vercel Cron — schedule: "0 */10 * * *"  (every 10 hours)
//
// For every active LinkedIn account, iterates its chats, matches leads by
// unipile_id, fetches the last 10 messages and asks OpenAI GPT-4o-mini to
// classify the conversation as "hot", "warm", or "cold".
// Results are persisted in leads.conversation_temperature.
//
// Limits:
//   - Up to 30 chats per account per run (respects Vercel 60s hobby timeout)
//   - Skips leads analysed in the last 9 h (safe-guard against double runs)
//   - 500 ms delay between batches of 5 to avoid bursting Unipile / OpenAI
//

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

const ANALYSIS_PROMPT =
  "Analiza el sentimiento de esta conversación de ventas en LinkedIn. " +
  "Responde ÚNICAMENTE con una palabra: " +
  "'hot' (si quiere agendar o pide info), " +
  "'warm' (si responde pero tiene dudas) o " +
  "'cold' (si no responde o no le interesa).\n\nConversación:\n{MESSAGES}";

function unipileHeaders() {
  return {
    'X-API-KEY': (process.env.UNIPILE_API_KEY || '').trim(),
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}
function unipileBase() {
  return `https://${(process.env.UNIPILE_DSN || '').trim()}`;
}

/** Pause execution for `ms` milliseconds */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function handler(req, res) {
  // ── Security: accept CRON_SECRET as Bearer token or x-cron-secret header ────
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const bearer = (req.headers.authorization || '').replace('Bearer ', '');
    const header = req.headers['x-cron-secret'] || '';
    if (bearer !== cronSecret && header !== cronSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const anthropicKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!anthropicKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }
  const dsn = (process.env.UNIPILE_DSN || '').trim();
  const apiKey = (process.env.UNIPILE_API_KEY || '').trim();
  if (!dsn || !apiKey) {
    return res.status(500).json({ error: 'Unipile not configured' });
  }

  // ── Staleness threshold: skip leads analysed < 9 h ago ──────────────
  const nineHoursAgo = new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString();

  let totalProcessed = 0;
  let totalErrors = 0;

  try {
    // 1. Get all teams that have at least one valid LinkedIn account
    const { data: accounts, error: accErr } = await supabaseAdmin
      .from('linkedin_accounts')
      .select('id, team_id, unipile_account_id')
      .eq('is_valid', true)
      .not('unipile_account_id', 'is', null);

    if (accErr) return res.status(500).json({ error: accErr.message });
    if (!accounts || accounts.length === 0) {
      return res.status(200).json({ processed: 0, message: 'No valid accounts found' });
    }

    // 2. Build a fast lookup: unipile_id → lead
    // Fetch leads that need analysis (not yet analysed OR analysed > 9 h ago)
    const { data: leadsToAnalyse } = await supabaseAdmin
      .from('leads')
      .select('id, team_id, unipile_id, last_analysis_at')
      .not('unipile_id', 'is', null)
      .or(`last_analysis_at.is.null,last_analysis_at.lt.${nineHoursAgo}`);

    if (!leadsToAnalyse || leadsToAnalyse.length === 0) {
      return res.status(200).json({ processed: 0, message: 'All leads are up-to-date' });
    }

    // Map: unipile_id (lowercase) → lead row
    const leadByProvider = new Map(
      leadsToAnalyse.map((l) => [l.unipile_id.toLowerCase(), l])
    );

    // Map: team_id → account (first valid one per team)
    const accountByTeam = new Map();
    for (const acc of accounts) {
      if (!accountByTeam.has(acc.team_id)) {
        accountByTeam.set(acc.team_id, acc);
      }
    }

    // 3. Process each account
    for (const [teamId, acc] of accountByTeam.entries()) {
      try {
        // 3a. Fetch chats for this account (up to 30 to stay in Vercel timeout)
        const chatsRes = await fetch(
          `${unipileBase()}/api/v1/chats?account_id=${acc.unipile_account_id}&limit=30`,
          { headers: unipileHeaders() }
        );
        if (!chatsRes.ok) continue;
        const chatsData = await chatsRes.json();
        const chatItems = chatsData.items || chatsData.chats || [];

        // 3b. Process chats in small batches
        const BATCH = 5;
        for (let i = 0; i < chatItems.length; i += BATCH) {
          const batch = chatItems.slice(i, i + BATCH);

          await Promise.all(
            batch.map(async (chat) => {
              try {
                // Fetch attendees to find the lead's provider_id
                const attRes = await fetch(
                  `${unipileBase()}/api/v1/chats/${chat.id}/attendees`,
                  { headers: unipileHeaders() }
                );
                if (!attRes.ok) return;
                const attData = await attRes.json();
                const attendees = attData.items || attData.attendees || attData || [];

                // Find the non-self attendee
                const other = attendees.find((a) => !a.is_self) || attendees[0];
                if (!other) return;

                const providerId = (other.provider_id || other.id || '').toLowerCase();
                if (!providerId) return;

                const lead = leadByProvider.get(providerId);
                if (!lead) return; // This chat doesn't correspond to a lead that needs analysis

                // 3c. Fetch last 10 messages
                const msgsRes = await fetch(
                  `${unipileBase()}/api/v1/chats/${chat.id}/messages?limit=10`,
                  { headers: unipileHeaders() }
                );
                if (!msgsRes.ok) return;
                const msgsData = await msgsRes.json();
                const messages = (msgsData.items || msgsData.messages || []).reverse();
                if (messages.length === 0) return;

                // 3d. Build conversation text (max 200 chars per message)
                const conversationText = messages
                  .map((m) => {
                    const dir =
                      String(m.is_sender) === 'true' || m.is_sender === 1
                        ? 'Yo'
                        : 'Contacto';
                    return `${dir}: ${(m.text || '[adjunto]').substring(0, 200)}`;
                  })
                  .join('\n');

                // 3e. Call Anthropic Claude (same model used across all API functions)
                const aiRes = await fetch(
                  'https://api.anthropic.com/v1/messages',
                  {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'x-api-key': anthropicKey,
                      'anthropic-version': '2023-06-01',
                    },
                    body: JSON.stringify({
                      model: 'claude-3-haiku-20240307',
                      max_tokens: 5,
                      messages: [
                        {
                          role: 'user',
                          content: ANALYSIS_PROMPT.replace(
                            '{MESSAGES}',
                            conversationText
                          ),
                        },
                      ],
                    }),
                  }
                );
                if (!aiRes.ok) return;
                const aiData = await aiRes.json();
                const rawTemp = (
                  aiData.content?.[0]?.text || ''
                )
                  .trim()
                  .toLowerCase();
                const temperature = ['hot', 'warm', 'cold'].includes(rawTemp)
                  ? rawTemp
                  : 'cold';

                // 3f. Persist result
                await supabaseAdmin
                  .from('leads')
                  .update({
                    conversation_temperature: temperature,
                    last_analysis_at: new Date().toISOString(),
                  })
                  .eq('id', lead.id);

                totalProcessed++;
              } catch (e) {
                console.error(
                  `[CRON][temperature] chat ${chat.id}:`,
                  e.message
                );
                totalErrors++;
              }
            })
          );

          // Throttle between batches
          if (i + BATCH < chatItems.length) await sleep(500);
        }
      } catch (e) {
        console.error(`[CRON][temperature] account ${acc.unipile_account_id}:`, e.message);
        totalErrors++;
      }
    }

    return res.status(200).json({
      processed: totalProcessed,
      errors: totalErrors,
      leads_eligible: leadsToAnalyse.length,
    });
  } catch (e) {
    console.error('[CRON][temperature] Fatal:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
