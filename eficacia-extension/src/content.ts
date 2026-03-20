// EficacIA Content Script — LinkedIn Sales Navigator + Apollo.io Dual-Mode Scraper
// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  MEGA FIX: Bulletproof Apollo scraper + extensive debug logging        ║
// ║  State persisted in chrome.storage.local — survives page reloads       ║
// ╚══════════════════════════════════════════════════════════════════════════╝

// ─── Constants ───────────────────────────────────────────────────────────────

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
  console.log(`[EficacIA MegaFix] Saving task to storage: ${task.leads.length} leads collected`);
  return new Promise(r => chrome.storage.local.set({ [TASK_KEY]: task }, r));
}

function clearTask(): Promise<void> {
  console.log('[EficacIA MegaFix] Clearing task from storage');
  return new Promise(r => chrome.storage.local.remove([TASK_KEY], r));
}

// ─── State ──────────────────────────────────────────────────────────────────

let _running = false;
let _stopped = false;

// ─── Message Listener ───────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  console.log('[EficacIA MegaFix] Message received:', message.type);

  if (message.type === 'START_SCRAPING') {
    const { campaign_id, limit, token, backendUrl } = message.payload;
    const platform = detectEnvironment();
    console.log(`[EficacIA MegaFix] START_SCRAPING — platform: ${platform} | limit: ${limit} | campaign: ${campaign_id}`);

    _stopped = false; // reset stop flag whenever a new scrape starts
    const task: ScrapingTask = {
      active: true,
      platform,
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

  if (message.type === 'RESUME_IF_STALLED') {
    console.log('[EficacIA MegaFix] RESUME_IF_STALLED received, _running:', _running);
    if (!_running) startScrapingProcess();
  }

  if (message.type === 'STOP_SCRAPING') {
    console.log('[EficacIA MegaFix] STOP_SCRAPING received — halting scraper');
    _stopped = true;
    _running = false;
    chrome.storage.local.remove([TASK_KEY]);
  }
});

// ─── Page Load Init ─────────────────────────────────────────────────────────

(function resumeOnLoad() {
  const env = detectEnvironment();
  console.log(`[EficacIA MegaFix] resumeOnLoad — env: ${env} | url: ${window.location.href}`);

  chrome.storage.local.get(TASK_KEY, (result) => {
    const task = result[TASK_KEY] as ScrapingTask | undefined;
    if (!task?.active) {
      console.log('[EficacIA MegaFix] No active task in storage');
      return;
    }
    if (task.platform !== env) {
      console.log(`[EficacIA MegaFix] Task platform (${task.platform}) != env (${env}), skipping`);
      return;
    }

    console.log(`[EficacIA MegaFix] Active task found! ${task.leads.length}/${task.limit} leads. Waiting for DOM...`);

    const waitThenResume = () => {
      if (_running) return;
      const ready =
        env === 'apollo'
          ? !!document.querySelector('a[href*="linkedin.com"]') || !!document.querySelector('table tbody tr')
          : !!document.querySelector('li.artdeco-list__item, .search-results__result-item');

      if (ready) {
        console.log('[EficacIA MegaFix] DOM ready — auto-resuming scraping');
        startScrapingProcess();
      } else {
        console.log('[EficacIA MegaFix] DOM not ready, retrying in 1s...');
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
  if (!task?.active) {
    console.log('[EficacIA MegaFix] startScrapingProcess: no active task, aborting');
    return;
  }

  _running = true;
  console.log(`[EficacIA MegaFix] ═══ SCRAPING STARTED ═══ platform: ${task.platform} | target: ${task.limit} | have: ${task.leads.length}`);

  try {
    if (task.platform === 'apollo') {
      await runApolloScraper(task);
    } else {
      await runLinkedInScraper(task);
    }

    const finalTask = await getTask();
    if (!finalTask) return;

    console.log(`[EficacIA MegaFix] ═══ SCRAPING COMPLETE ═══ Submitting ${finalTask.leads.length} leads to backend`);

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
    console.error('[EficacIA MegaFix] Scraping error:', error);
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
  console.log('[EficacIA MegaFix] runLinkedInScraper started');

  while (task.leads.length < task.limit) {
    if (_stopped) { console.log('[EficacIA MegaFix] LinkedIn: stop requested, exiting loop'); break; }

    await scrollToBottom();

    const pageLeads = extractLinkedInLeadsFromPage();
    console.log(`[EficacIA MegaFix] LinkedIn: found ${pageLeads.length} leads on current page`);

    const seen = new Set(task.leads.map(l => l.linkedin_url));
    for (const lead of pageLeads) {
      if (task.leads.length >= task.limit) break;
      if (!seen.has(lead.linkedin_url)) {
        seen.add(lead.linkedin_url);
        task.leads.push(lead);
      }
    }

    await saveTask(task);
    sendProgress(task);
    console.log(`[EficacIA MegaFix] LinkedIn progress: ${task.leads.length}/${task.limit}`);

    if (task.leads.length >= task.limit) break;

    const movedToNext = await goToNextLinkedInPage();
    if (!movedToNext) {
      console.log('[EficacIA MegaFix] LinkedIn: No more pages available');
      break;
    }
  }
}

async function scrollToBottom(): Promise<void> {
  const scrollEl =
    document.querySelector('.search-results__result-list') ||
    document.scrollingElement ||
    document.documentElement;

  let previousHeight = -1;
  let stableRounds = 0;

  while (stableRounds < 3) {
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

function extractLinkedInLeadsFromPage(): Lead[] {
  const leads: Lead[] = [];
  const listItems = document.querySelectorAll('li.artdeco-list__item, .search-results__result-item');
  console.log(`[EficacIA MegaFix] LinkedIn: scanning ${listItems.length} list items`);

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
      console.warn('[EficacIA MegaFix] LinkedIn parse error:', e);
    }
  });

  return leads;
}

async function goToNextLinkedInPage(): Promise<boolean> {
  const nextBtn = (
    document.querySelector('.artdeco-pagination__button--next') ||
    document.querySelector('button.search-results__pagination-next-button')
  ) as HTMLButtonElement | null;

  if (!nextBtn || nextBtn.disabled) {
    console.log('[EficacIA MegaFix] LinkedIn: next button not found or disabled');
    return false;
  }

  console.log('[EficacIA MegaFix] LinkedIn: clicking Next page...');
  const previousFirstItem = document.querySelector('li.artdeco-list__item, .search-results__result-item');
  nextBtn.click();
  await waitForLinkedInPageTransition(previousFirstItem);
  return true;
}

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
      const current = document.querySelector('li.artdeco-list__item, .search-results__result-item');
      if (!current) { done(); return; }
      if (current !== previousFirstItem) { done(); return; }
      if (previousFirstItem === null && current !== null) done();
    };

    const timer = setTimeout(() => {
      observer.disconnect();
      console.warn('[EficacIA MegaFix] LinkedIn: page transition timed out');
      sleep(4000).then(resolve);
    }, timeoutMs);

    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    check();
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  APOLLO.IO — MEGA FIX SCRAPER
// ════════════════════════════════════════════════════════════════════════════

async function runApolloScraper(task: ScrapingTask): Promise<void> {
  console.log('[EficacIA MegaFix] runApolloScraper started — waiting for rows...');
  await waitForApolloRows();
  // Extra hydration delay — Apollo renders in stages
  await sleep(2000);
  console.log('[EficacIA MegaFix] Apollo rows detected, beginning extraction loop');

  while (task.leads.length < task.limit) {
    if (_stopped) { console.log('[EficacIA MegaFix] Apollo: stop requested, exiting loop'); break; }

    await scrollApolloTable();
    await sleep(700);

    const pageLeads = extractApolloLeads();
    console.log(`[EficacIA MegaFix] Apollo: extracted ${pageLeads.length} leads from current page`);

    const seen = new Set(task.leads.map(l => l.linkedin_url).filter(Boolean));
    for (const lead of pageLeads) {
      if (task.leads.length >= task.limit) break;
      if (lead.linkedin_url && !seen.has(lead.linkedin_url)) {
        seen.add(lead.linkedin_url);
        task.leads.push(lead);
      }
    }

    await saveTask(task);
    sendProgress(task);
    console.log(`[EficacIA MegaFix] Apollo progress: ${task.leads.length}/${task.limit}`);

    if (task.leads.length >= task.limit) break;

    const moved = await goToNextApolloPage();
    if (!moved) {
      console.log('[EficacIA MegaFix] Apollo: No more pages available');
      break;
    }
  }
}

function waitForApolloRows(timeoutMs = 20000): Promise<void> {
  const isReady = () =>
    !!document.querySelector('a[href*="linkedin.com"]') ||
    !!document.querySelector('table tbody tr') ||
    !!document.querySelector('[role="row"]') ||
    !!document.querySelector('.zp_accordion_row, .zp_baseRow, [class*="Row"]');

  return new Promise(resolve => {
    if (isReady()) {
      console.log('[EficacIA MegaFix] Apollo rows already present');
      resolve();
      return;
    }

    const timer = setTimeout(() => {
      observer.disconnect();
      console.warn('[EficacIA MegaFix] waitForApolloRows timed out — proceeding anyway');
      resolve();
    }, timeoutMs);

    const observer = new MutationObserver(() => {
      if (isReady()) {
        clearTimeout(timer);
        observer.disconnect();
        console.log('[EficacIA MegaFix] Apollo rows appeared via MutationObserver');
        resolve();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  });
}

async function scrollApolloTable(): Promise<void> {
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

// ─── Apollo Lead Extraction (MegaFix: bulletproof heuristic) ─────────────────

function extractApolloLeads(): Lead[] {
  // STEP 1: Find ALL LinkedIn links on the page (broad match)
  const links = document.querySelectorAll<HTMLAnchorElement>('a[href*="linkedin.com"]');
  console.log(`[EficacIA MegaFix] Apollo STEP 1: Found ${links.length} linkedin.com links on page`);

  const seen = new Set<string>();
  const leads: Lead[] = [];

  for (const anchor of links) {
    try {
      // Skip company pages
      if (anchor.href.includes('/company/') || anchor.href.includes('/companies/')) continue;

      // Normalize LinkedIn URL — accept /in/ profiles and Sales Nav /lead/ URLs
      const match = anchor.href.match(/(https?:\/\/(?:www\.)?linkedin\.com\/(?:in|sales\/lead)\/[^/?#\s]+)/);
      if (!match) continue;
      const linkedin_url = match[1].replace(/\/$/, '') + '/';
      if (seen.has(linkedin_url)) continue;
      seen.add(linkedin_url);

      // STEP 2: Climb to the row container — Apollo uses divs (.zp_baseRow, etc.)
      const row =
        anchor.closest('.zp_accordion_row') ||
        anchor.closest('.zp_baseRow') ||
        anchor.closest('tr') ||
        anchor.closest('[role="row"]') ||
        anchor.closest('div[class*="Row"]') ||
        climbToRowContainer(anchor);

      if (!row) {
        console.log(`[EficacIA MegaFix] Apollo STEP 2: No row container for ${linkedin_url}`);
        continue;
      }

      console.log(`[EficacIA MegaFix] Apollo STEP 2: Row found <${row.tagName}> for ${linkedin_url}`);

      // STEP 3: Extract name, title, company from the row
      const lead = extractLeadFromRow(row, linkedin_url);
      if (lead) {
        leads.push(lead);
        console.log(`[EficacIA MegaFix] Apollo STEP 3: Extracted: ${lead.first_name} ${lead.last_name} | ${lead.job_title} @ ${lead.company}`);
      }
    } catch (e) {
      console.warn('[EficacIA MegaFix] Apollo: Parse error for', anchor.href, e);
    }
  }

  console.log(`[EficacIA MegaFix] Apollo: Total leads from page: ${leads.length}`);
  return leads;
}

/**
 * Fallback row detection: climb the DOM tree until we find a container whose
 * parent has multiple same-tag siblings that also contain LinkedIn links.
 */
function climbToRowContainer(anchor: HTMLAnchorElement): Element | null {
  let candidate: Element | null = anchor.parentElement;
  for (let depth = 0; depth < 12 && candidate; depth++) {
    const parent = candidate.parentElement;
    if (!parent) break;

    const siblings = Array.from(parent.children).filter(c => c.tagName === candidate!.tagName);
    if (
      siblings.length >= 3 &&
      !['SPAN', 'A', 'BUTTON', 'TD'].includes(candidate.tagName)
    ) {
      const othersWithLinks = siblings.filter(
        s => s !== candidate && s.querySelector('a[href*="linkedin.com"]')
      );
      if (othersWithLinks.length >= 1) {
        console.log(`[EficacIA MegaFix] Apollo: Fallback row found at depth ${depth} <${candidate.tagName}>`);
        return candidate;
      }
    }
    candidate = parent;
  }
  return null;
}

function extractLeadFromRow(row: Element, linkedin_url: string): Lead | null {
  // ── Name ──
  const nameAnchor = row.querySelector<HTMLAnchorElement>('a[href*="/people/"], a[href*="/contacts/"]');
  let fullName = nameAnchor?.textContent?.trim() ?? '';

  // Fallback: any anchor text that looks like a personal name
  if (!fullName) {
    for (const a of Array.from(row.querySelectorAll<HTMLAnchorElement>('a'))) {
      if (a.href.includes('linkedin.com') || a.href.includes('/companies/')) continue;
      const text = a.textContent?.trim() ?? '';
      const words = text.split(/\s+/).filter(Boolean);
      if (words.length >= 1 && words.length <= 5 && text.length > 2 && text.length < 60 && !/[@\d({]/.test(text.charAt(0))) {
        fullName = text;
        break;
      }
    }
  }

  // Fallback: first cell-like element (td OR direct child div) with uppercase content
  if (!fullName) {
    const cellLike = row.querySelectorAll('td, > div');
    for (const cell of cellLike) {
      const text = (cell.textContent?.trim() ?? '').split('\n')[0].trim();
      if (text.length > 2 && text.length < 60 && /^[A-Z\u00C0-\u00DC]/.test(text) && !/[@\d]/.test(text.charAt(0))) {
        fullName = text;
        break;
      }
    }
  }

  const nameParts = (fullName || '').split(/\s+/).filter(Boolean);
  const first_name = nameParts[0] ?? '';
  const last_name = nameParts.slice(1).join(' ') ?? '';
  if (!first_name) return null;

  // ── Job Title & Company ──
  // Apollo uses divs as cells — try <td> first, fall back to direct child <div>s
  let cells = Array.from(row.querySelectorAll('td'));
  if (cells.length < 2) {
    cells = Array.from(row.querySelectorAll(':scope > div'));
  }
  let job_title = '';
  let company = '';

  const companyAnchor = row.querySelector<HTMLAnchorElement>('a[href*="/companies/"], a[data-cy="company-name-link"]');
  company = companyAnchor?.textContent?.trim() ?? '';

  if (cells.length >= 2) {
    let nameCellIdx = nameAnchor ? cells.findIndex(c => c.contains(nameAnchor)) : -1;
    if (nameCellIdx < 0) {
      nameCellIdx = cells.findIndex(c => (c.textContent?.trim() ?? '').includes(first_name));
    }
    if (nameCellIdx < 0) nameCellIdx = 0;

    job_title = cells[nameCellIdx + 1]?.textContent?.trim().split('\n')[0].trim() ?? '';
    if (!company) {
      company = cells[nameCellIdx + 2]?.textContent?.trim().split('\n')[0].trim() ?? '';
    }
  }

  // ── Email (if unlocked/visible) ──
  let email: string | undefined;
  const allCells = cells.length > 0 ? cells : Array.from(row.querySelectorAll('td, > div'));
  for (const cell of allCells) {
    const text = cell.textContent?.trim() ?? '';
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
      email = text;
      break;
    }
  }

  return { first_name, last_name, job_title, company, linkedin_url, location: '', email };
}

// ─── Apollo Pagination ──────────────────────────────────────────────────────

async function goToNextApolloPage(): Promise<boolean> {
  // Scroll to bottom first — forces lazy-loading of pagination controls
  window.scrollTo(0, document.body.scrollHeight);
  await sleep(1000);

  const nextBtn = findApolloNextButton();
  if (!nextBtn) {
    console.log('[EficacIA MegaFix] Apollo: next button not found');
    return false;
  }

  console.log('[EficacIA MegaFix] Apollo: clicking Next page...');
  const previousUrl = window.location.href;
  const previousFirstRow = document.querySelector('table tbody tr, [role="row"], .zp_accordion_row, .zp_baseRow');

  nextBtn.click();
  await waitForApolloPageTransition(previousFirstRow, previousUrl);
  console.log('[EficacIA MegaFix] Apollo: page transition complete');
  return true;
}

function findApolloNextButton(): HTMLButtonElement | HTMLAnchorElement | null {
  // 1. Direct aria-label / data-cy match
  const directSelectors = [
    'button[data-cy="next-page-button"]',
    'button[aria-label="next page"]',
    'button[aria-label="Next page"]',
    'button[aria-label="Next Page"]',
    'a[aria-label="next page"]',
    'button[title="Next page"]',
    'button[title="Next Page"]',
  ];
  for (const sel of directSelectors) {
    const btn = document.querySelector<HTMLButtonElement | HTMLAnchorElement>(sel);
    if (btn && !btn.hasAttribute('disabled') && btn.getAttribute('aria-disabled') !== 'true') {
      console.log('[EficacIA MegaFix] Apollo: next btn found via', sel);
      return btn;
    }
  }

  // 2. Apollo-specific: icon button with chevron-right / right-arrow
  const iconBtns = document.querySelectorAll<HTMLButtonElement>(
    'button:has(i[class*="chevron-right"]), ' +
    'button:has(i[class*="arrow-right"]), ' +
    'button:has(svg[class*="right"]), ' +
    '.zp-button:has(.zp-icon-chevron-right)'
  );
  for (const btn of iconBtns) {
    if (!btn.disabled && btn.getAttribute('aria-disabled') !== 'true') {
      console.log('[EficacIA MegaFix] Apollo: next btn found via icon chevron-right');
      return btn;
    }
  }

  // 3. Pagination containers — look for next-like buttons
  const containers = document.querySelectorAll('[class*="pagination"], [class*="Pagination"], [role="navigation"], [class*="pager"]');
  for (const container of containers) {
    const buttons = [...container.querySelectorAll<HTMLButtonElement>('button, a')];
    const nextLike = buttons.find(b => {
      if ((b as HTMLButtonElement).disabled || b.getAttribute('aria-disabled') === 'true') return false;
      const text = b.textContent?.trim() ?? '';
      const label = (b.getAttribute('aria-label') ?? '').toLowerCase();
      const cls = (b.className ?? '').toLowerCase();
      return text === '>' || text === '\u203A' || text === '\u00BB' || label.includes('next') || cls.includes('next');
    });
    if (nextLike) {
      console.log('[EficacIA MegaFix] Apollo: next btn found in pagination container');
      return nextLike as HTMLButtonElement;
    }

    // Last enabled button in pagination is usually "next"
    const last = [...buttons].reverse().find(
      b => !(b as HTMLButtonElement).disabled && b.getAttribute('aria-disabled') !== 'true'
    );
    if (last) {
      console.log('[EficacIA MegaFix] Apollo: next btn — using last enabled in pagination');
      return last as HTMLButtonElement;
    }
  }

  // 4. Brute-force: any button whose inner <i> has "right" in class or whose parent is near page numbers
  const allButtons = document.querySelectorAll<HTMLButtonElement>('button');
  for (const btn of allButtons) {
    if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') continue;
    const icon = btn.querySelector('i, svg');
    if (icon && /(right|forward|next)/i.test(icon.className)) {
      console.log('[EficacIA MegaFix] Apollo: next btn found via brute-force icon scan');
      return btn;
    }
  }

  return null;
}

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
      const current = document.querySelector('table tbody tr, [role="row"], .zp_accordion_row, .zp_baseRow');
      if (!current) { done(); return; }
      if (current !== previousFirstRow) done();
    };

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        observer.disconnect();
        console.warn('[EficacIA MegaFix] Apollo: page transition timed out');
        sleep(3000).then(resolve);
      }
    }, timeoutMs);

    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    sleep(400).then(check);
  });
}

// ─── Shared Utilities ────────────────────────────────────────────────────────

function sendProgress(task: ScrapingTask): void {
  const pct = Math.min((task.leads.length / task.limit) * 100, 100);
  chrome.runtime.sendMessage({
    type: 'SCRAPING_PROGRESS',
    payload: {
      progress: pct,
      current: task.leads.length,
      limit: task.limit,
    },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
