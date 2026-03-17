/**
 * /api/linkedin/campaign-engine
 *
 * ESTRATEGIA DE JITTER HUMANO (SERVERLESS COMPATIBLE):
 * 1. El Cron Job se ejecuta cada 2-5 minutos.
 * 2. En lugar de procesar muchos leads "en bloque", procesamos un máximo de 1 LEAD por ejecución del Cron.
 * 3. Al terminar cada acción, reprogramamos el 'next_action_at' con el retraso del paso secuencial
 *    MÁS un "Humano Jitter" aleatorio (ej: 5-15 minutos extra) para que el próximo lead del mismo lote
 *    no se dispare inmediatamente en el siguiente ciclo del Cron.
 * 4. Esto mantiene a la función de Vercel siempre por debajo del tiempo de Timeout
 *    y espacia las acciones de forma orgánica en el tiempo.
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
  const auth = req.headers.authorization;
  if (auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  return !!getUserId(req);
}

function delayToMs(value, unit = 'days') {
  const multipliers = {
    minutes: 60 * 1000,
    hours: 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000,
    weeks: 7 * 24 * 60 * 60 * 1000,
  };
  return value * (multipliers[unit] || multipliers.days);
}

/**
 * Genera un retraso aleatorio entre min y max minutos para simular comportamiento humano
 */
function getHumanJitterMs(minMinutes = 5, maxMinutes = 15) {
  const minutes = Math.floor(Math.random() * (maxMinutes - minMinutes + 1) + minMinutes);
  return minutes * 60 * 1000;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!verifyCron(req)) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const now = new Date();
  console.log(`[ENGINE] Heartbeat: ${now.toISOString()}`);
  const stats = { campaigns: 0, processed: 0, errors: 0, skipped: 0 };

  try {
    // 1. Buscamos todas las campañas activas
    const { data: campaigns, error: campErr } = await supabaseAdmin
      .from('campaigns')
      .select('id, name, sequence, settings, team_id')
      .eq('status', 'active');

    if (campErr) throw campErr;
    if (!campaigns || campaigns.length === 0) {
      return res.status(200).json({ message: 'No hay campañas activas', stats });
    }

    stats.campaigns = campaigns.length;

    // Procesamos campañas una por una
    for (const campaign of campaigns) {
      const sequence = campaign.sequence || [];
      const accountIds = campaign.settings?.linkedin_account_ids || [];
      if (sequence.length === 0 || accountIds.length === 0) continue;

      // Limites diarios y control de volumen
      const dailyLimit = campaign.settings?.daily_limit_invitations || campaign.settings?.daily_limit_messages || 25;
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { count: todayCount } = await supabaseAdmin
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', campaign.id)
        .gte('last_action_at', todayStart.toISOString());

      if (todayCount >= dailyLimit) {
        console.log(`[ENGINE] Campaign ${campaign.name} hit daily limit (${todayCount})`);
        continue;
      }

      // 2. BUSCAMOS LEADS LISTOS (JITTER COMPATIBLE)
      // Seleccionamos solo 1 LEAD por campaña por cada ejecución del Cron para forzar el espaciado temporal.
      const { data: lead } = await supabaseAdmin
        .from('leads')
        .select('*')
        .eq('campaign_id', campaign.id)
        .in('sequence_status', ['pending', 'active'])
        .lte('next_action_at', now.toISOString())
        .order('next_action_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!lead) {
        // Si no hay leads listos para procesar AHORA, revisamos si la campaña terminó
        const { count: activeCount } = await supabaseAdmin
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .eq('campaign_id', campaign.id)
          .in('sequence_status', ['pending', 'active']);

        if (activeCount === 0) {
          await supabaseAdmin.from('campaigns').update({
            status: 'completed',
            ended_at: now.toISOString()
          }).eq('id', campaign.id);
        }
        continue;
      }

      // 3. EJECUCIÓN DE ACCIÓN
      const stepIndex = lead.current_step || 0;
      const step = sequence[stepIndex];

      if (!step) {
        await supabaseAdmin.from('leads').update({ sequence_status: 'completed' }).eq('id', lead.id);
        continue;
      }

      try {
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const host = req.headers.host;
        
        // Llamada a la acción real de LinkedIn
        const sendRes = await fetch(`${protocol}://${host}/api/linkedin/send-action`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-engine-key': process.env.JWT_SECRET || 'dev-secret',
          },
          body: JSON.stringify({
            leadId: lead.id,
            accountId: accountIds[0],
            actionType: step.type,
            content: step.content || '',
            campaignId: campaign.id,
          }),
        });

        if (!sendRes.ok) {
          const errData = await sendRes.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed call to send-action');
        }

        // 4. RE-PROGRAMACIÓN CON JITTER HUMANO
        const nextStepIndex = stepIndex + 1;
        const nextStep = sequence[nextStepIndex];

        let nextActionAt = null;
        if (nextStep) {
          // Delay base (días/horas definidos en el paso) + JITTER (5-15 min)
          const baseDelayMs = delayToMs(nextStep.delayDays || 1, nextStep.delayUnit || 'days');
          const jitterMs = getHumanJitterMs(10, 30); // Entre 10 y 30 minutos de "vía libre"
          nextActionAt = new Date(Date.now() + baseDelayMs + jitterMs).toISOString();
        }

        await supabaseAdmin.from('leads').update({
          current_step: nextStepIndex,
          sequence_status: nextStep ? 'active' : 'completed',
          next_action_at: nextActionAt,
          last_action_at: now.toISOString(),
          error_message: null
        }).eq('id', lead.id);

        stats.processed++;
        console.log(`[ENGINE] Lead ${lead.id} processed (Step ${stepIndex}). Next run set with Jitter: ${nextActionAt}`);

      } catch (err) {
        console.error(`[ENGINE] Error in lead ${lead.id}:`, err.message);
        await supabaseAdmin.from('leads').update({
          sequence_status: 'active', // Lo dejamos activo para reintento suave en el próximo ciclo
          next_action_at: new Date(Date.now() + 20 * 60 * 1000).toISOString(), // Penalización 20 min por error
          error_message: err.message,
          last_action_at: now.toISOString()
        }).eq('id', lead.id);
        stats.errors++;
      }

      // Actualizamos contadores de la campaña
      const { count: sentCount } = await supabaseAdmin
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', campaign.id)
        .eq('sent_message', true);

      await supabaseAdmin.from('campaigns').update({
        sent_count: sentCount || 0,
        updated_at: now.toISOString()
      }).eq('id', campaign.id);
    }

    return res.status(200).json({ success: true, stats });

  } catch (err) {
    console.error('[ENGINE] Fatal error:', err.message);
    return res.status(500).json({ error: err.message, stats });
  }
}
