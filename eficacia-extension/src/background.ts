// EficacIA Background Service Worker — v2.0 (Background State Machine)
// The background now OWNS the scraping clock. All delays (4-6s between pages,
// 30-45s anti-bot breaks) are scheduled here via chrome.alarms so they are
// NEVER throttled by Chrome's tab-backgrounding mechanism.

const API_BASE = 'https://eficac-ia.vercel.app';
const STATE_KEY = 'eficacia_active_task';
const STEP_ALARM = 'eficacia_step';
const WATCHDOG_ALARM = 'eficacia_watchdog';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Lead {
  first_name: string;
  last_name: string;
  job_title: string;
  company: string;
  linkedin_url: string;
  location: string;
  email?: string;
}

// Phase determines what command to send next to the content script
type Phase =
  | 'SCROLL'         // send CMD_SCROLL → wait for SCROLL_DONE
  | 'WAIT_SCROLL'    // 4-6s wait (alarm) so LinkedIn/Apollo can hydrate the cards
  | 'EXTRACT'        // send CMD_EXTRACT → wait for EXTRACT_DONE
  | 'NEXT_PAGE'      // send CMD_NEXT_PAGE → wait for NEXT_PAGE_DONE
  | 'WAIT_NEXT'      // 5-8s wait (alarm) after navigation before next SCROLL
  | 'ANTI_BOT_BREAK' // 30-45s pause (alarm) every 4 pages
  | 'SUBMIT';        // send leads to backend and clear state

interface ScraperState {
  active: boolean;
  platform: 'apollo' | 'sales_navigator';
  campaign_id: string;
  limit: number;
  token: string;
  backendUrl: string;
  leads: Lead[];
  phase: Phase;
  pageCount: number;
  consecutiveEmptyPages: number;
  tabId: number;
  lastActivityAt: number;
}

// ─── State helpers ────────────────────────────────────────────────────────────

function getState(): Promise<ScraperState | null> {
  return new Promise(r =>
    chrome.storage.local.get(STATE_KEY, s => r((s[STATE_KEY] as ScraperState) ?? null))
  );
}

function saveState(state: ScraperState): Promise<void> {
  return new Promise(r => chrome.storage.local.set({ [STATE_KEY]: state }, r));
}

function clearState(): Promise<void> {
  return new Promise(r => chrome.storage.local.remove([STATE_KEY], r));
}

// ─── Alarm helpers ────────────────────────────────────────────────────────────

// One-shot alarm — fires after delayMs and calls advance() via the alarm listener.
// Chrome may clamp delays < 30 s in some builds; that's fine — it just means
// we wait a bit longer, but timing is NEVER controlled by the content script.
function scheduleStep(delayMs: number): void {
  chrome.alarms.clear(STEP_ALARM, () => {
    chrome.alarms.create(STEP_ALARM, { when: Date.now() + Math.max(delayMs, 500) });
  });
}

function ensureWatchdogAlarm(): void {
  chrome.alarms.get(WATCHDOG_ALARM, (existing) => {
    if (!existing) {
      chrome.alarms.create(WATCHDOG_ALARM, { periodInMinutes: 1 });
    }
  });
}

// ─── Ping-pong anti-suspension loop ──────────────────────────────────────────
// Background's own setTimeout is NOT throttled by tab-visibility rules.
// Sending a message to the content tab every 5 s counts as "extension activity"
// which prevents Chrome from aggressively hibernating the tab's JS context.

let _pingActive = false;

function startPingLoop(tabId: number): void {
  if (_pingActive) return;
  _pingActive = true;

  const tick = async () => {
    if (!_pingActive) return;
    const state = await getState();
    if (!state?.active) { _pingActive = false; return; }
    chrome.tabs.sendMessage(tabId, { type: 'CMD_PING' }).catch(() => {});
    setTimeout(tick, 5000);
  };

  setTimeout(tick, 5000);
}

function stopPingLoop(): void {
  _pingActive = false;
}

// ─── State-machine core: advance() ───────────────────────────────────────────

async function advance(): Promise<void> {
  const state = await getState();
  if (!state?.active) {
    console.log('[EficacIA BG] advance() — no active state, stopping');
    return;
  }

  const { phase, tabId, leads, limit } = state;
  console.log(`[EficacIA BG] advance() phase=${phase} leads=${leads.length}/${limit} tab=${tabId}`);

  switch (phase) {

    case 'SCROLL':
      // Fire-and-forget; if content is not yet ready the send will reject and
      // scheduleStep(3000) will retry (see catch).
      chrome.tabs.sendMessage(tabId, { type: 'CMD_SCROLL', payload: { platform: state.platform } })
        .catch(async (err) => {
          console.error('[EficacIA BG] CMD_SCROLL failed, injecting content script:', err);
          await injectContentScript(tabId);
          scheduleStep(2000);
        });
      break;

    case 'WAIT_SCROLL': {
      // Wait 4-6 s (in background) before extracting so LinkedIn can hydrate cards
      const delay = 4000 + Math.random() * 2000;
      console.log(`[EficacIA BG] WAIT_SCROLL: ${Math.round(delay / 1000)}s before extract`);
      state.phase = 'EXTRACT';
      await saveState(state);
      scheduleStep(delay);
      break;
    }

    case 'EXTRACT':
      chrome.tabs.sendMessage(tabId, { type: 'CMD_EXTRACT', payload: { platform: state.platform } })
        .catch(err => { console.error('[EficacIA BG] CMD_EXTRACT failed:', err); scheduleStep(3000); });
      break;

    case 'NEXT_PAGE':
      chrome.tabs.sendMessage(tabId, { type: 'CMD_NEXT_PAGE', payload: { platform: state.platform } })
        .catch(err => { console.error('[EficacIA BG] CMD_NEXT_PAGE failed:', err); scheduleStep(3000); });
      break;

    case 'WAIT_NEXT': {
      // Wait 5-8 s (in background) for full page render after navigation
      const delay = 5000 + Math.random() * 3000;
      console.log(`[EficacIA BG] WAIT_NEXT: ${Math.round(delay / 1000)}s for page to render`);
      state.phase = 'SCROLL';
      await saveState(state);
      scheduleStep(delay);
      break;
    }

    case 'ANTI_BOT_BREAK': {
      const delay = 30000 + Math.random() * 15000; // 30-45 s
      console.log(`[EficacIA BG] ANTI_BOT_BREAK: ${Math.round(delay / 1000)}s`);
      chrome.runtime.sendMessage({
        type: 'SCRAPING_PROGRESS',
        payload: {
          progress: Math.min((leads.length / limit) * 100, 99),
          current: leads.length,
          limit,
          statusText: '⏸ Pausa anti-bot...',
        },
      }).catch(() => {});
      state.phase = 'NEXT_PAGE';
      await saveState(state);
      scheduleStep(delay);
      break;
    }

    case 'SUBMIT':
      await doSubmit(state);
      break;
  }
}

// ─── Handle EXTRACT_DONE ─────────────────────────────────────────────────────

async function onExtractDone(newLeads: Lead[]): Promise<void> {
  const state = await getState();
  if (!state?.active) return;

  console.log(`[EficacIA BG] onExtractDone: +${newLeads.length} leads`);

  if (newLeads.length === 0) {
    state.consecutiveEmptyPages++;
    console.warn(`[EficacIA BG] Empty page #${state.consecutiveEmptyPages}`);
  } else {
    state.consecutiveEmptyPages = 0;
  }

  if (state.consecutiveEmptyPages >= 3) {
    console.warn('[EficacIA BG] 3 consecutive empty pages — submitting what we have');
    state.phase = 'SUBMIT';
    await saveState(state);
    await advance();
    return;
  }

  const seen = new Set(state.leads.map(l => l.linkedin_url));
  for (const lead of newLeads) {
    if (state.leads.length >= state.limit) break;
    if (lead.linkedin_url && !seen.has(lead.linkedin_url)) {
      seen.add(lead.linkedin_url);
      state.leads.push(lead);
    }
  }

  state.lastActivityAt = Date.now();
  sendProgressFromState(state);
  console.log(`[EficacIA BG] Progress: ${state.leads.length}/${state.limit}`);

  if (state.leads.length >= state.limit) {
    state.phase = 'SUBMIT';
    await saveState(state);
    await advance();
    return;
  }

  // Schedule next page after a human-like inter-page delay (done in background)
  state.pageCount++;
  const interDelay = 3500 + Math.random() * 3500; // 3.5-7 s
  state.phase = state.pageCount % 4 === 0 ? 'ANTI_BOT_BREAK' : 'NEXT_PAGE';

  await saveState(state);
  scheduleStep(interDelay);
}

// ─── Handle NEXT_PAGE_DONE ───────────────────────────────────────────────────

async function onNextPageDone(moved: boolean): Promise<void> {
  const state = await getState();
  if (!state?.active) return;

  if (!moved) {
    console.log('[EficacIA BG] No more pages — submitting');
    state.phase = 'SUBMIT';
    await saveState(state);
    await advance();
    return;
  }

  // Background owns the post-navigation wait
  state.phase = 'WAIT_NEXT';
  await saveState(state);
  await advance();
}

// ─── Submit ───────────────────────────────────────────────────────────────────

async function doSubmit(state: ScraperState): Promise<void> {
  console.log(`[EficacIA BG] Submitting ${state.leads.length} leads...`);
  stopPingLoop();

  try {
    await submitLeads(state.campaign_id, state.leads, state.token, state.backendUrl, state.platform);
    chrome.runtime.sendMessage({ type: 'SCRAPING_FINISHED' }).catch(() => {});
  } catch (err: any) {
    console.error('[EficacIA BG] Submit error:', err);
    chrome.runtime.sendMessage({
      type: 'SCRAPING_ERROR',
      payload: { error: err.message || 'Error al enviar leads al servidor' },
    }).catch(() => {});
  } finally {
    await clearState();
  }
}

function sendProgressFromState(state: ScraperState): void {
  const pct = Math.min((state.leads.length / state.limit) * 100, 100);
  chrome.runtime.sendMessage({
    type: 'SCRAPING_PROGRESS',
    payload: { progress: pct, current: state.leads.length, limit: state.limit },
  }).catch(() => {});
}

// ─── Content script injection helper ─────────────────────────────────────────

async function injectContentScript(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['assets/content.js'],
    });
    console.log(`[EficacIA BG] Content script injected into tab ${tabId}`);
  } catch (err) {
    console.error('[EficacIA BG] injection failed:', err);
  }
}

// ─── Alarm listener ───────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === STEP_ALARM) {
    await advance();
    return;
  }

  if (alarm.name === WATCHDOG_ALARM) {
    const state = await getState();
    if (!state?.active) return;

    const staleMs = Date.now() - (state.lastActivityAt ?? 0);
    console.log(`[EficacIA BG] Watchdog: stale=${Math.round(staleMs / 1000)}s phase=${state.phase}`);

    if (staleMs > 120000) {
      // No activity for 2 minutes — re-send the current command
      console.warn('[EficacIA BG] Watchdog: stalled 2 min, re-advancing');
      await advance();
    }
  }
});

// ─── Message listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const fromTabId = sender.tab?.id;

  switch (message.type) {

    // ── Popup → Background: kick off a new scrape ──────────────────────────
    case 'START_SCRAPING': {
      (async () => {
        const { campaign_id, limit, token, backendUrl, tabId, platform } = message.payload;
        const targetTabId: number = tabId ?? fromTabId;
        if (!targetTabId) {
          chrome.runtime.sendMessage({
            type: 'SCRAPING_ERROR',
            payload: { error: 'No se encontró la pestaña activa.' },
          }).catch(() => {});
          sendResponse({ ok: false });
          return;
        }

        // Ensure content script is running before we send commands
        await injectContentScript(targetTabId);

        const state: ScraperState = {
          active: true,
          platform: platform ?? (await detectPlatformForTab(targetTabId)),
          campaign_id,
          limit,
          token,
          backendUrl,
          leads: [],
          phase: 'SCROLL',
          pageCount: 0,
          consecutiveEmptyPages: 0,
          tabId: targetTabId,
          lastActivityAt: Date.now(),
        };

        await saveState(state);
        startPingLoop(targetTabId);
        ensureWatchdogAlarm();

        // Short delay to let content script register its message listener
        scheduleStep(1200);
        console.log(`[EficacIA BG] START_SCRAPING — tab=${targetTabId} platform=${state.platform} limit=${limit}`);
        sendResponse({ ok: true });
      })();
      return true; // async sendResponse
    }

    // ── Popup → Background: stop ───────────────────────────────────────────
    case 'STOP_SCRAPING': {
      stopPingLoop();
      chrome.alarms.clear(STEP_ALARM);
      getState().then(state => {
        if (state?.tabId) {
          chrome.tabs.sendMessage(state.tabId, { type: 'STOP_SCRAPING' }).catch(() => {});
        }
      });
      clearState().then(() => {
        chrome.runtime.sendMessage({ type: 'SCRAPING_STOPPED' }).catch(() => {});
      });
      break;
    }

    // ── Content → Background: step results ────────────────────────────────

    case 'SCROLL_DONE': {
      (async () => {
        const state = await getState();
        if (!state?.active) return;
        state.phase = 'WAIT_SCROLL';
        state.lastActivityAt = Date.now();
        await saveState(state);
        await advance(); // immediately enter WAIT_SCROLL to schedule alarm
      })();
      break;
    }

    case 'EXTRACT_DONE': {
      onExtractDone(message.payload?.leads ?? []);
      break;
    }

    case 'NEXT_PAGE_DONE': {
      onNextPageDone(message.payload?.moved ?? false);
      break;
    }

    // ── Content → Background: content script ready after page load ─────────
    case 'CONTENT_READY': {
      (async () => {
        const state = await getState();
        if (!state?.active) return;
        if (fromTabId !== state.tabId) return;
        console.log(`[EficacIA BG] CONTENT_READY from tab ${fromTabId}, phase=${state.phase}`);
        // Re-trigger current phase if it was waiting for a command execution
        if (state.phase === 'SCROLL' || state.phase === 'EXTRACT' || state.phase === 'NEXT_PAGE') {
          scheduleStep(1500);
        }
      })();
      break;
    }

    case 'PONG': {
      // Keep-alive heartbeat from content script — nothing to do
      break;
    }

    // ── Legacy: direct submit path (kept for backward compat) ─────────────
    case 'SUBMIT_LEADS': {
      const { campaign_id, leads, token, backendUrl, source } = message.payload;
      submitLeads(campaign_id, leads, token, backendUrl, source)
        .then(() => chrome.runtime.sendMessage({ type: 'SCRAPING_FINISHED' }).catch(() => {}))
        .catch(err =>
          chrome.runtime.sendMessage({
            type: 'SCRAPING_ERROR',
            payload: { error: err.message || 'Error al enviar leads' },
          }).catch(() => {})
        );
      return true; // async
    }
  }
});

// ─── Tab detection helper ─────────────────────────────────────────────────────

async function detectPlatformForTab(tabId: number): Promise<'apollo' | 'sales_navigator'> {
  try {
    const tab = await chrome.tabs.get(tabId);
    return (tab.url ?? '').includes('apollo.io') ? 'apollo' : 'sales_navigator';
  } catch {
    return 'sales_navigator';
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  console.log('EficacIA Extension v2.0 Installed (Background State Machine)');
  ensureWatchdogAlarm();
});

chrome.runtime.onStartup.addListener(ensureWatchdogAlarm);

// ─── submitLeads ──────────────────────────────────────────────────────────────

async function submitLeads(
  campaign_id: string,
  leads: any[],
  token: string,
  backendUrl: string,
  source?: string
): Promise<void> {
  console.log(`[EficacIA Background] Submitting ${leads.length} leads (source: ${source ?? 'extension'}) to ${backendUrl}...`);

  const baseUrl = backendUrl?.startsWith('http') ? backendUrl : API_BASE;

  const response = await fetch(`${baseUrl}/api/linkedin/bulk-import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      type: 'extension',
      campaign_id,
      leads,
      ...(source ? { source } : {}),
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error((errorData as any).message || `Error del servidor: ${response.status}`);
  }

  console.log('[EficacIA Background] Bulk import successful!');
}
