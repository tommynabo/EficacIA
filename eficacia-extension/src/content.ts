// EficacIA Content Script — LinkedIn Sales Navigator + Apollo.io Dual-Mode Scraper
// State is persisted in chrome.storage.local so scraping survives page reloads and
// background-tab throttling. The background service worker sends a RESUME_IF_STALLED
// alarm tick every minute to restart a stalled loop even when the tab is backgrounded.

// ─── Constants ───────────────────────────────────────────────────────────────

// Apollo builds its UI with hashed class names that change on every deploy.
// We anchor to structural / semantic attributes that are stable.
const APOLLO_ROW =
  '[data-cy="contacts-table-row"], ' +
  '[data-testid="contacts-table-row"], ' +
  'table tbody tr';

// chrome.storage.local key
const TASK_KEY = 'eficacia_active_task';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Lead {
  first_name: string;
  last_name: string;
  job_title: string;
  company: string;
  linkedin_url: string;
  location: string;
  email?: string;
}

/** Full task state — persisted to storage after every page so reloads can resume. */
interface ScrapingTask {
  active: boolean;
  platform: 'apollo' | 'sales_navigator';
  campaign_id: string;
  limit: number;
  token: string;
  backendUrl: string;
  leads: Lead[];
}

type Environment = 'sales_navigator' | 'apollo';

// ─── Storage Helpers ─────────────────────────────────────────────────────────

function getTask(): Promise<ScrapingTask | null> {
  return new Promise(r =>
    chrome.storage.local.get(TASK_KEY, s => r((s[TASK_KEY] as ScrapingTask) ?? null))
  );
}

function saveTask(task: ScrapingTask): Promise<void> {
  return new Promise(r => chrome.storage.local.set({ [TASK_KEY]: task }, r));
}

function clearTask(): Promise<void> {
  return new Promise(r => chrome.storage.local.remove([TASK_KEY], r));
}

// ─── State ──────────────────────────────────────────────────────────────────

/** Per-page in-process guard — prevents double-start within the same page lifecycle. */
let _running = false;

// ─── Message Listener ───────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  if (message.type === 'START_SCRAPING') {
    const { campaign_id, limit, token, backendUrl } = message.payload;
    const task: ScrapingTask = {
      active: true,
      platform: detectEnvironment(),
      campaign_id,
      limit,
      token,
      backendUrl,
      leads: [],
    };
    chrome.storage.local.set({ [TASK_KEY]: task }, () => {
      if (!_running) startScrapingProcess();
    });
  }

  // Sent by the background watchdog alarm every minute while a task is active.
  if (message.type === 'RESUME_IF_STALLED') {
    if (!_running) startScrapingProcess();
  }
});

// ─── Page Load Init ───────────────────────────────────────────────────────────
// Checks storage for an in-progress task. If found, auto-resumes scraping after
// each full-page-reload (e.g. paginated LinkedIn or Apollo navigation).

(function resumeOnLoad() {
  const env = detectEnvironment();

  chrome.storage.local.get(TASK_KEY, (result) => {
    const task = result[TASK_KEY] as ScrapingTask | undefined;
    if (!task?.active) return;
    if (task.platform !== env) return; // task belongs to a different platform/tab

    console.log(`[EficacIA] Auto-resuming: ${task.leads.length}/${task.limit} leads collected`);

    const waitThenResume = () => {
      if (_running) return;
      const ready =
        env === 'apollo'
          ? !!document.querySelector('a[href*="linkedin.com/in/"]') || !!document.querySelector(APOLLO_ROW)
          : !!document.querySelector('li.artdeco-list__item, .search-results__result-item');

      if (ready) {
        startScrapingProcess();
      } else {
        setTimeout(waitThenResume, 1000);
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(waitThenResume, 1500));
    } else {
      setTimeout(waitThenResume, 1500);
    }
  });
})();

// ─── Environment Detection ───────────────────────────────────────────────────

function detectEnvironment(): Environment {
  return window.location.hostname.includes('apollo.io') ? 'apollo' : 'sales_navigator';
}

// ─── Main Dispatch ───────────────────────────────────────────────────────────

async function startScrapingProcess(): Promise<void> {
  if (_running) return;
  const task = await getTask();
  if (!task?.active) return;

  _running = true;
  console.log(`[EficacIA] Env: ${task.platform} | Target: ${task.limit} | Have: ${task.leads.length}`);

  try {
    if (task.platform === 'apollo') {
      await runApolloScraper(task);
    } else {
      await runLinkedInScraper(task);
    }

    // Re-read from storage to get the latest leads (survives page reloads mid-run)
    const finalTask = await getTask();
    if (!finalTask) return;

    chrome.runtime.sendMessage({
      type: 'SUBMIT_LEADS',
      payload: {
        campaign_id: finalTask.campaign_id,
        leads: finalTask.leads,
        token: finalTask.token,
        backendUrl: finalTask.backendUrl,
        source: finalTask.platform,
      },
    });

    await clearTask();
  } catch (error: any) {
    console.error('[EficacIA] Scraping error:', error);
    chrome.runtime.sendMessage({
      type: 'SCRAPING_ERROR',
      payload: { error: error.message },
    });
    await clearTask();
  } finally {
    _running = false;
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  LINKEDIN SALES NAVIGATOR
// ════════════════════════════════════════════════════════════════════════════

async function runLinkedInScraper(task: ScrapingTask): Promise<void> {
  while (task.leads.length < task.limit) {
    await scrollToBottom();

    const seen = new Set(task.leads.map(l => l.linkedin_url));
    for (const lead of extractLeadsFromPage()) {
      if (task.leads.length >= task.limit) break;
      if (!seen.has(lead.linkedin_url)) {
        seen.add(lead.linkedin_url);
        task.leads.push(lead);
      }
    }

    // Persist after every page so a page reload can resume from here
    await saveTask(task);
    sendProgress(task);

    if (task.leads.length >= task.limit) break;

    const movedToNext = await goToNextPage();
    if (!movedToNext) {
      console.log('[EficacIA LI] No more pages.');
      break;
    }
    // If LinkedIn performs a full page reload here, resumeOnLoad() will auto-resume.
  }
}

async function scrollToBottom(): Promise<void> {
  const scrollEl =
    document.querySelector('.search-results__result-list') ||
    document.scrollingElement ||
    document.documentElement;

  let previousHeight = -1;
  let stableRounds = 0;
  const STABLE_NEEDED = 3;

  while (stableRounds < STABLE_NEEDED) {
    const currentHeight = (scrollEl as HTMLElement).scrollHeight;
    window.scrollTo(0, currentHeight);

    if (currentHeight === previousHeight) {
      stableRounds++;
    } else {
      stableRounds = 0;
      previousHeight = currentHeight;
    }

    await sleep(stableRounds === 0 ? 800 : 400);
  }

  await sleep(1200);
}

function extractLeadsFromPage(): Lead[] {
  const leads: Lead[] = [];
  const listItems = document.querySelectorAll('li.artdeco-list__item, .search-results__result-item');

  listItems.forEach(item => {
    try {
      const nameEl = item.querySelector('[data-anonymize="person-name"], .result-lockup__name a');
      const profileLink = item.querySelector('a[data-control-name="view_profile"], .result-lockup__name a') as HTMLAnchorElement;

      if (nameEl && profileLink) {
        const fullName = nameEl.textContent?.trim() || '';
        const parts = fullName.split(' ');
        const first_name = parts[0] || '';
        const last_name = parts.slice(1).join(' ') || '';

        const titleEl = item.querySelector('[data-anonymize="job-title"], .result-lockup__highlight-keyword');
        const companyEl = item.querySelector('[data-anonymize="company-name"], .result-lockup__position-company');
        const locationEl = item.querySelector('[data-anonymize="location"], .result-lockup__location');

        let linkedin_url = profileLink.href;
        if (linkedin_url.includes('?')) linkedin_url = linkedin_url.split('?')[0];

        leads.push({
          first_name,
          last_name,
          job_title: titleEl?.textContent?.trim() || '',
          company: companyEl?.textContent?.trim() || '',
          linkedin_url,
          location: locationEl?.textContent?.trim() || '',
        });
      }
    } catch (e) {
      console.warn('[EficacIA LI] Parsing error', e);
    }
  });

  return leads;
}

async function goToNextPage(): Promise<boolean> {
  const nextBtn = (
    document.querySelector('.artdeco-pagination__button--next') ||
    document.querySelector('button.search-results__pagination-next-button')
  ) as HTMLButtonElement | null;

  if (!nextBtn || nextBtn.disabled) return false;

  const previousFirstItem = document.querySelector(
    'li.artdeco-list__item, .search-results__result-item'
  );

  nextBtn.click();
  await waitForLinkedInPageTransition(previousFirstItem);
  return true;
}

/**
 * Uses MutationObserver instead of sleep-polling so the wait completes correctly
 * even when the tab is throttled in the background.
 */
function waitForLinkedInPageTransition(
  previousFirstItem: Element | null,
  timeoutMs = 18000
): Promise<void> {
  return new Promise(resolve => {
    const done = () => {
      clearTimeout(timer);
      observer.disconnect();
      sleep(1500).then(resolve);
    };

    const check = () => {
      const current = document.querySelector(
        'li.artdeco-list__item, .search-results__result-item'
      );
      if (!current) { done(); return; }                              // list cleared → new page loading
      if (current !== previousFirstItem) { done(); return; }        // first item replaced → loaded
      if (previousFirstItem === null && current !== null) done();   // had nothing, now has content
    };

    const timer = setTimeout(() => {
      observer.disconnect();
      console.warn('[EficacIA LI] waitForPageTransition timed out.');
      sleep(4000).then(resolve);
    }, timeoutMs);

    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    check(); // immediate check in case transition already happened
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  APOLLO.IO
// ════════════════════════════════════════════════════════════════════════════

async function runApolloScraper(task: ScrapingTask): Promise<void> {
  await waitForApolloRows();

  while (task.leads.length < task.limit) {
    // Scroll container so all rows in this page batch are mounted
    await scrollApolloTable();
    await sleep(700);

    // Extract and deduplicate
    const seen = new Set(task.leads.map(l => l.linkedin_url).filter(Boolean));
    for (const lead of extractApolloLeads()) {
      if (task.leads.length >= task.limit) break;
      if (lead.linkedin_url && !seen.has(lead.linkedin_url)) {
        seen.add(lead.linkedin_url);
        task.leads.push(lead);
      }
    }

    // Persist after every page
    await saveTask(task);
    sendProgress(task);
    console.log(`[EficacIA Apollo] ${task.leads.length}/${task.limit}`);

    if (task.leads.length >= task.limit) break;

    const moved = await goToNextApolloPage();
    if (!moved) {
      console.log('[EficacIA Apollo] No more pages.');
      break;
    }
  }
}

function waitForApolloRows(timeoutMs = 20000): Promise<void> {
  // LinkedIn anchors are the most reliable signal that the contacts table has loaded.
  const isReady = () =>
    !!document.querySelector('a[href*="linkedin.com/in/"]') ||
    !!document.querySelector(APOLLO_ROW);

  return new Promise(resolve => {
    if (isReady()) { resolve(); return; }

    const timer = setTimeout(() => {
      observer.disconnect();
      console.warn('[EficacIA Apollo] waitForApolloRows timed out — proceeding anyway.');
      resolve();
    }, timeoutMs);

    const observer = new MutationObserver(() => {
      if (isReady()) {
        clearTimeout(timer);
        observer.disconnect();
        resolve();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  });
}

async function scrollApolloTable(): Promise<void> {
  // Apollo may wrap the table in a custom scrollable container.
  const container =
    document.querySelector<HTMLElement>('[class*="table_wrapper"], [class*="tableWrapper"], .infinite-scroll-component') ??
    document.querySelector<HTMLElement>('main, [role="main"]') ??
    document.documentElement;

  let prev = -1;
  let stable = 0;

  while (stable < 2) {
    const h = container.scrollHeight;
    container.scrollTop = h;
    window.scrollTo(0, document.body.scrollHeight);
    if (h === prev) { stable++; } else { stable = 0; prev = h; }
    await sleep(600);
  }

  await sleep(500);
}

function extractApolloLeads(): Lead[] {
  // Strategy: anchor on every visible LinkedIn /in/ URL, then walk up to the
  // containing table row to extract name, title, and company from sibling cells.
  // This is resilient to Apollo's hashed CSS class names changing on every deploy.
  const linkedinAnchors = Array.from(
    document.querySelectorAll<HTMLAnchorElement>('a[href*="linkedin.com/in/"]')
  ).filter(a => /linkedin\.com\/in\/[^/?#\s]+/.test(a.href));

  const seen = new Set<string>();
  const leads: Lead[] = [];

  for (const anchor of linkedinAnchors) {
    try {
      // ── LinkedIn URL ───────────────────────────────────────────────────────
      const match = anchor.href.match(/(https?:\/\/(?:www\.)?linkedin\.com\/in\/[^/?#\s]+)/);
      if (!match) continue;
      const linkedin_url = match[1].replace(/\/$/, '') + '/';
      if (seen.has(linkedin_url)) continue;
      seen.add(linkedin_url);

      // Walk up to the nearest row container
      const row = anchor.closest('tr') ?? anchor.closest('[class*="row"]') ?? anchor.closest('li');
      if (!row) continue;

      // ── Name ──────────────────────────────────────────────────────────────
      // Apollo wraps the contact name in an anchor pointing to /people/ or /contacts/
      const nameAnchor = row.querySelector<HTMLAnchorElement>(
        'a[href*="/people/"], a[href*="/contacts/"]'
      );
      let fullName = nameAnchor?.textContent?.trim() ?? '';

      if (!fullName) {
        // Fallback: first cell whose text looks like a name (short, no @ or leading digit)
        const cells = row.querySelectorAll('td');
        for (const cell of cells) {
          const text = (cell.textContent?.trim() ?? '').split('\n')[0].trim();
          if (text.length > 1 && text.length < 60 && !/[@\d]/.test(text.charAt(0))) {
            fullName = text;
            break;
          }
        }
      }

      const nameParts = (fullName || '').split(/\s+/).filter(Boolean);
      const first_name = nameParts[0] ?? '';
      const last_name = nameParts.slice(1).join(' ') ?? '';
      if (!first_name) continue;

      // ── Job Title & Company ───────────────────────────────────────────────
      const cells = Array.from(row.querySelectorAll('td'));

      // Find which cell holds the name anchor to offset title/company correctly
      let nameCellIdx = nameAnchor ? cells.findIndex(c => c.contains(nameAnchor)) : -1;
      if (nameCellIdx < 0) nameCellIdx = 1; // default: name in cell 1, after checkbox

      const titleCell = cells[nameCellIdx + 1];
      const job_title = titleCell?.textContent?.trim().split('\n')[0].trim() ?? '';

      const companyAnchor = row.querySelector<HTMLAnchorElement>(
        'a[href*="/companies/"], a[data-cy="company-name-link"]'
      );
      const companyCell = cells[nameCellIdx + 2];
      const company =
        companyAnchor?.textContent?.trim() ??
        companyCell?.textContent?.trim().split('\n')[0].trim() ??
        '';

      // ── Email (if unlocked) ───────────────────────────────────────────────
      let email: string | undefined;
      cells.forEach(cell => {
        const text = cell.textContent?.trim() ?? '';
        if (!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
          email = text;
        }
      });

      leads.push({ first_name, last_name, job_title, company, linkedin_url, location: '', email });
    } catch (e) {
      console.warn('[EficacIA Apollo] Parse error', e);
    }
  }

  return leads;
}

async function goToNextApolloPage(): Promise<boolean> {
  const nextBtn = findApolloNextButton();
  if (!nextBtn) return false;

  const previousUrl = window.location.href;
  const previousFirstRow = document.querySelector(APOLLO_ROW);

  nextBtn.click();
  await waitForApolloPageTransition(previousFirstRow, previousUrl);
  return true;
}

function findApolloNextButton(): HTMLButtonElement | HTMLAnchorElement | null {
  // Explicit data-attributes / aria-labels (most stable)
  const byAttr = document.querySelector<HTMLButtonElement | HTMLAnchorElement>(
    'button[data-cy="next-page-button"], ' +
    'button[aria-label="next page"], ' +
    'button[aria-label="Next page"], ' +
    'a[aria-label="next page"], ' +
    'button[title="Next page"]'
  );
  if (byAttr && !byAttr.hasAttribute('disabled') && byAttr.getAttribute('aria-disabled') !== 'true') {
    return byAttr;
  }

  // Fallback: pagination container's last enabled button whose label/text implies "next"
  const containers = document.querySelectorAll('[class*="pagination"], [class*="Pagination"], [role="navigation"]');
  for (const container of containers) {
    const buttons = [...container.querySelectorAll<HTMLButtonElement>('button')];
    const nextLike = buttons.find(b => {
      if (b.disabled || b.getAttribute('aria-disabled') === 'true') return false;
      const text = b.textContent?.trim() ?? '';
      const label = (b.getAttribute('aria-label') ?? '').toLowerCase();
      return text === '>' || text === '›' || text === '»' || label.includes('next');
    });
    if (nextLike) return nextLike;

    // Last-resort: last enabled button (pagination convention)
    const last = [...buttons].reverse().find(
      b => !b.disabled && b.getAttribute('aria-disabled') !== 'true'
    );
    if (last) return last;
  }

  return null;
}

/**
 * Uses MutationObserver to detect Apollo page transitions — not throttled in background tabs.
 */
function waitForApolloPageTransition(
  previousFirstRow: Element | null,
  previousUrl: string,
  timeoutMs = 20000
): Promise<void> {
  return new Promise(resolve => {
    let settled = false;

    const done = async () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      observer.disconnect();
      await waitForApolloRows();
      await sleep(800);
      resolve();
    };

    const check = () => {
      if (window.location.href !== previousUrl) { done(); return; }
      const current = document.querySelector(APOLLO_ROW);
      if (!current) { done(); return; }
      if (current !== previousFirstRow) done();
    };

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        observer.disconnect();
        console.warn('[EficacIA Apollo] waitForApolloPageTransition timed out.');
        sleep(3000).then(resolve);
      }
    }, timeoutMs);

    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    // Also poll for URL hash/search changes (not caught by MutationObserver)
    sleep(400).then(check);
  });
}

// ─── Shared Utilities ────────────────────────────────────────────────────────

function sendProgress(task: ScrapingTask): void {
  chrome.runtime.sendMessage({
    type: 'SCRAPING_PROGRESS',
    payload: {
      progress: Math.min((task.leads.length / task.limit) * 100, 100),
      current: task.leads.length,
      limit: task.limit,
    },
  });
  console.log(`[EficacIA] ${task.leads.length}/${task.limit}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
