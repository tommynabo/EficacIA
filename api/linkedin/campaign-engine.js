/**
 * /api/linkedin/campaign-engine
 *
 * ESTRATEGIA DE THROTTLE DINÁMICO + JITTER HUMANO (SERVERLESS COMPATIBLE):
 * 1. El Cron Job se ejecuta cada CRON_INTERVAL_MINUTES (por defecto 5 min → 12x/hora).
 * 2. El tamaño del lote (batchSize) se calcula dinámicamente por cuenta:
 *      batchSize = ceil(max_actions_per_hour / (60 / CRON_INTERVAL_MINUTES))
 *    Ej: 5 acc/hr → 1 lead/ejecución; 60 acc/hr → 5; 120 acc/hr → 10.
 * 3. Los leads del lote se procesan en serie con un "micro-jitter" entre ellos
 *    para no saturar la API de Unipile en ráfaga.
 * 4. Al terminar cada acción secuencial, se reprograma el 'next_action_at' con el
 *    delay base del paso siguiente MÁS un jitter humano (10-30 min).
 *
 * UMBRAL DE RIESGO: max_actions_per_hour > 15 se considera Peligroso.
 * El frontend advierte al usuario antes de guardar ese valor.
 */
import { createClient } from '@supabase/supabase-js';


const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);


/**
 * Solo acepta peticiones que vengan con el header:
 *   Authorization: Bearer <CRON_SECRET>
 * Configura CRON_SECRET en las variables de entorno de Vercel.
 * El servicio externo (cron-job.org) debe enviar este header en cada ping.
 */
function verifyCron(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[ENGINE] CRON_SECRET no está configurado en las variables de entorno.');
    return false;
  }
  const auth = req.headers.authorization || '';
  return auth === `Bearer ${secret}`;
}

/**
 * Frecuencia del cron en minutos. Debe coincidir con el schedule de vercel.json.
 * Si el cron corre cada 5 min → 12 ejecuciones/hora.
 */
const CRON_INTERVAL_MINUTES = 5;

/**
 * Calcula el tamaño del lote a procesar en esta ejecución, en base a las
 * acciones por hora permitidas para la cuenta y la frecuencia del cron.
 */
function calcBatchSize(maxActionsPerHour = 5) {
  const runsPerHour = 60 / CRON_INTERVAL_MINUTES; // 12 por defecto
  return Math.max(1, Math.ceil(maxActionsPerHour / runsPerHour));
}

/**
 * Retraso asíncrono (para micro-jitter entre leads del mismo lote).
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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

/**
 * Comprueba si `now` (UTC) cae dentro del horario de trabajo definido en el
 * schedule de la campaña, convertido a la zona horaria del usuario.
 * Devuelve true si se debe procesar (horario desactivado = siempre verdadero).
 */
function isWithinSchedule(schedule, now) {
  if (!schedule || !schedule.enabled) return true;

  const tz = schedule.timezone || 'UTC';
  try {
    // Extraer día de la semana y hora local usando la API nativa ECMA-402
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);

    const dayStr = parts.find(p => p.type === 'weekday')?.value; // 'Mon', 'Tue'...
    const hourStr = parts.find(p => p.type === 'hour')?.value || '0';
    const minuteStr = parts.find(p => p.type === 'minute')?.value || '0';

    const DAY_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const currentDay = DAY_MAP[dayStr] ?? -1;
    const currentMinutes = parseInt(hourStr) * 60 + parseInt(minuteStr);

    const allowedDays = schedule.days || [1, 2, 3, 4, 5];
    if (!allowedDays.includes(currentDay)) return false;

    const [startH, startM] = (schedule.start_time || '09:00').split(':').map(Number);
    const [endH, endM] = (schedule.end_time || '18:00').split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } catch (e) {
    console.warn(`[ENGINE] isWithinSchedule error (tz=${tz}):`, e.message);
    return true; // ante la duda, dejar pasar
  }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

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
      .select('id, name, sequence, settings, team_id, schedule')
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

      // --- Validación de Horario de Campaña ---
      if (!isWithinSchedule(campaign.schedule, now)) {
        console.log(`[ENGINE] Campaign "${campaign.name}" skipped — fuera del horario de trabajo (tz: ${campaign.schedule?.timezone || 'N/A'})`);
        stats.skipped++;
        continue;
      }

      // --- Obtener configuración de throttle de la cuenta principal ---
      const primaryAccountId = accountIds[0];
      const { data: accountConfig } = await supabaseAdmin
        .from('linkedin_accounts')
        .select('max_actions_per_hour')
        .eq('id', primaryAccountId)
        .maybeSingle();

      const maxActionsPerHour = accountConfig?.max_actions_per_hour ?? 5;
      const batchSize = calcBatchSize(maxActionsPerHour);
      console.log(`[ENGINE] Campaign "${campaign.name}" → max_actions_per_hour=${maxActionsPerHour}, batchSize=${batchSize}`);

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

      // Cuántos leads podemos aún procesar hoy
      const remainingToday = dailyLimit - (todayCount || 0);
      const effectiveBatch = Math.min(batchSize, remainingToday);

      // 2. BUSCAMOS LOTE DE LEADS LISTOS
      const { data: leadsToProcess } = await supabaseAdmin
        .from('leads')
        .select('*')
        .eq('campaign_id', campaign.id)
        .in('sequence_status', ['pending', 'active', 'retry_later'])
        .lte('next_action_at', now.toISOString())
        .order('next_action_at', { ascending: true })
        .limit(effectiveBatch);

      if (!leadsToProcess || leadsToProcess.length === 0) {
        // Revisar si la campaña terminó
        const { count: activeCount } = await supabaseAdmin
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .eq('campaign_id', campaign.id)
          .in('sequence_status', ['pending', 'active', 'retry_later']);

        if (activeCount === 0) {
          await supabaseAdmin.from('campaigns').update({
            status: 'completed',
            ended_at: now.toISOString()
          }).eq('id', campaign.id);
        }
        continue;
      }

      // 3. PROCESAMIENTO EN SERIE DEL LOTE (anti-ban DB-level jitter — no sleep() en serverless)
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers.host;

      // Pre-fetch account throttle state once before iterating the batch
      let accountThrottledUntil = null;
      {
        const { data: acctBefore } = await supabaseAdmin
          .from('linkedin_accounts')
          .select('next_action_at')
          .eq('id', primaryAccountId)
          .maybeSingle();
        accountThrottledUntil = acctBefore?.next_action_at ? new Date(acctBefore.next_action_at) : null;
      }

      for (let i = 0; i < leadsToProcess.length; i++) {
        const lead = leadsToProcess[i];

        // Anti-ban: skip remaining leads if account DB throttle is still active
        if (accountThrottledUntil && accountThrottledUntil > now) {
          console.log(`[ENGINE] Anti-ban throttle active for account ${primaryAccountId} until ${accountThrottledUntil.toISOString()}. Skipping ${leadsToProcess.length - i} remaining lead(s).`);
          stats.skipped += leadsToProcess.length - i;
          break;
        }

        const stepIndex = lead.current_step || 0;
        const step = sequence[stepIndex];

        if (!step) {
          await supabaseAdmin.from('leads').update({ sequence_status: 'completed' }).eq('id', lead.id);
          continue;
        }

        try {
          // Llamada a la acción real de LinkedIn
          const sendRes = await fetch(`${protocol}://${host}/api/linkedin/send-action`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-engine-key': process.env.JWT_SECRET || 'dev-secret',
            },
            body: JSON.stringify({
              leadId: lead.id,
              accountId: primaryAccountId,
              actionType: step.type,
              content: step.content || '',
              campaignId: campaign.id,
            }),
          });

          const sendData = await sendRes.json().catch(() => ({}));

          // FIX: Atrapar el 202 de "Procesando IA" para no saltarse el paso
          if (sendRes.status === 202 || sendData.status === 'processing') {
            console.log(`[ENGINE] Lead ${lead.id} procesando Apify, pausando 5 mins.`);
            await supabaseAdmin.from('leads').update({
              sequence_status: 'retry_later',
              next_action_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // Reintento en 5 min
              error_message: 'Analizando perfil con IA...',
              last_action_at: now.toISOString(),
            }).eq('id', lead.id);
            continue; // Vital: evitamos que avance el step de la secuencia
          }

          if (!sendRes.ok) {
            const httpStatus = sendRes.status;
            const rawMsg = sendData.error || `Error HTTP ${httpStatus}`;
            let humanMsg, newStatus, nextAt;

            if (httpStatus === 502 || httpStatus === 503 || httpStatus === 504) {
              // Transient Unipile/network upstream error — retry in 1 hour
              humanMsg = rawMsg;
              newStatus = 'retry_later';
              nextAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
            } else if (httpStatus === 429 || /r[aá]te.?limit|l[ií]mite.?diario|daily.?limit/i.test(rawMsg)) {
              // LinkedIn rate-limit — retry tomorrow morning
              humanMsg = 'Límite diario de LinkedIn alcanzado. Se reintentará mañana.';
              newStatus = 'retry_later';
              const tomorrow = new Date();
              tomorrow.setDate(tomorrow.getDate() + 1);
              tomorrow.setHours(9, 0, 0, 0);
              nextAt = tomorrow.toISOString();
            } else if (/disconnect|desconect/i.test(rawMsg)) {
              // LinkedIn session expired / account disconnected
              humanMsg = 'Cuenta de LinkedIn desconectada.';
              newStatus = 'failed';
              nextAt = null;
            } else if (httpStatus === 403 || /privad[ao]|private|no permite/i.test(rawMsg)) {
              // Private profile or messaging blocked
              humanMsg = 'El perfil de este usuario es privado o no permite mensajes.';
              newStatus = 'failed';
              nextAt = null;
            } else {
              // Generic / unknown error — keep active with 20-min penalty
              humanMsg = rawMsg;
              newStatus = 'active';
              nextAt = new Date(Date.now() + 20 * 60 * 1000).toISOString();
            }

            await supabaseAdmin.from('leads').update({
              sequence_status: newStatus,
              next_action_at: nextAt,
              error_message: humanMsg,
              last_action_at: now.toISOString(),
            }).eq('id', lead.id);
            stats.errors++;
            console.log(`[ENGINE] Lead ${lead.id} → ${newStatus} (HTTP ${httpStatus}): ${humanMsg}`);
            continue;
          }

          // 4. Success: re-schedule next step with human jitter
          const nextStepIndex = stepIndex + 1;
          const nextStep = sequence[nextStepIndex];

          let nextActionAt = null;
          if (nextStep) {
            // Delay base (días/horas definidos en el paso) + JITTER (10-30 min)
            const baseDelayMs = delayToMs(nextStep.delayDays || 1, nextStep.delayUnit || 'days');
            const jitterMs = getHumanJitterMs(10, 30);
            nextActionAt = new Date(Date.now() + baseDelayMs + jitterMs).toISOString();
          }

          await supabaseAdmin.from('leads').update({
            current_step: nextStepIndex,
            sequence_status: nextStep ? 'active' : 'completed',
            next_action_at: nextActionAt,
            last_action_at: now.toISOString(),
            error_message: null,
          }).eq('id', lead.id);

          // Anti-ban: DB-level jitter on account — 45 to 120 seconds before next action.
          // NO sleep() in serverless functions. The NEXT cron run respects this timestamp.
          const antiBanJitterSec = Math.floor(Math.random() * 76) + 45; // [45, 120] inclusive
          const newThrottleTime = new Date(Date.now() + antiBanJitterSec * 1000);
          await supabaseAdmin.from('linkedin_accounts').update({
            next_action_at: newThrottleTime.toISOString(),
          }).eq('id', primaryAccountId);
          accountThrottledUntil = newThrottleTime; // Update local cache so remaining batch knows

          stats.processed++;
          console.log(`[ENGINE] Lead ${lead.id} processed (Step ${stepIndex}). Anti-ban throttle: ${antiBanJitterSec}s. Next lead at: ${newThrottleTime.toISOString()}`);

        } catch (err) {
          // Network-level failure (fetch itself threw) → transient, retry in 1 hour
          console.error(`[ENGINE] Network error for lead ${lead.id}:`, err.message);
          await supabaseAdmin.from('leads').update({
            sequence_status: 'retry_later',
            next_action_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // +1h
            error_message: err.message,
            last_action_at: now.toISOString(),
          }).eq('id', lead.id);
          stats.errors++;
        }
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
