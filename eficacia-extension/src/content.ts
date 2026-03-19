// EficacIA Content Script — LinkedIn Sales Navigator + Apollo.io Dual-Mode Scraper

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

type Environment = 'sales_navigator' | 'apollo';

// ─── State ──────────────────────────────────────────────────────────────────

let isScraping = false;
let leadsExtracted: Lead[] = [];
let targetLimit = 0;
let currentCampaignId = '';
let authToken = '';
let apiBaseUrl = '';

// ─── Message Listener ───────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  if (message.type === 'START_SCRAPING') {
    const { campaign_id, limit, token, backendUrl } = message.payload;
    currentCampaignId = campaign_id;
    targetLimit = limit;
    authToken = token;
    apiBaseUrl = backendUrl;
    if (!isScraping) startScrapingProcess();
  }
});

// ─── Page Load Init (Apollo button injection) ───────────────────────────────

(function init() {
  if (!window.location.hostname.includes('apollo.io')) return;

  // Wait for Apollo's SPA shell before injecting the button
  const tryInject = () => {
    if (document.querySelector('table, [class*="zp_"]')) {
      injectApolloExportButton();
    } else {
      setTimeout(tryInject, 1200);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInject);
  } else {
    tryInject();
  }

  // Re-inject after SPA navigations (Apollo changes the hash/path without full reload)
  let lastHref = window.location.href;
  new MutationObserver(() => {
    if (window.location.href !== lastHref) {
      lastHref = window.location.href;
      setTimeout(() => {
        const existing = document.getElementById('eficacia-export-btn');
        if (existing) existing.remove();
        injectApolloExportButton();
      }, 1500);
    }
  }).observe(document.body, { childList: true, subtree: true });
})();

// ─── Environment Detection ───────────────────────────────────────────────────

function detectEnvironment(): Environment {
  return window.location.hostname.includes('apollo.io') ? 'apollo' : 'sales_navigator';
}

// ─── Main Dispatch ───────────────────────────────────────────────────────────

async function startScrapingProcess(): Promise<void> {
  isScraping = true;
  leadsExtracted = [];
  const env = detectEnvironment();
  console.log(`[EficacIA] Env: ${env} | Target: ${targetLimit}`);

  try {
    if (env === 'apollo') {
      await runApolloScraper();
    } else {
      await runLinkedInScraper();
    }

    chrome.runtime.sendMessage({
      type: 'SUBMIT_LEADS',
      payload: {
        campaign_id: currentCampaignId,
        leads: leadsExtracted,
        token: authToken,
        backendUrl: apiBaseUrl,
        source: env,
      },
    });
  } catch (error: any) {
    console.error('[EficacIA] Scraping error:', error);
    chrome.runtime.sendMessage({
      type: 'SCRAPING_ERROR',
      payload: { error: error.message },
    });
  } finally {
    isScraping = false;
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  LINKEDIN SALES NAVIGATOR
// ════════════════════════════════════════════════════════════════════════════

async function runLinkedInScraper(): Promise<void> {
  while (leadsExtracted.length < targetLimit) {
    await scrollToBottom();

    const newLeads = extractLeadsFromPage();
    for (const lead of newLeads) {
      if (leadsExtracted.length >= targetLimit) break;
      if (!leadsExtracted.find(l => l.linkedin_url === lead.linkedin_url)) {
        leadsExtracted.push(lead);
      }
    }

    sendProgress();
    if (leadsExtracted.length >= targetLimit) break;

    const movedToNext = await goToNextPage();
    if (!movedToNext) {
      console.log('[EficacIA LI] No more pages.');
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

async function waitForLinkedInPageTransition(
  previousFirstItem: Element | null,
  timeoutMs = 18000
): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const currentFirstItem = document.querySelector(
      'li.artdeco-list__item, .search-results__result-item'
    );

    const listGone = !currentFirstItem;
    const itemChanged =
      currentFirstItem !== null &&
      previousFirstItem !== null &&
      currentFirstItem !== previousFirstItem;
    const hadNoItemsBefore = previousFirstItem === null && currentFirstItem !== null;

    if (listGone || itemChanged || hadNoItemsBefore) {
      await sleep(1500);
      return;
    }

    await sleep(250);
  }

  console.warn('[EficacIA LI] waitForPageTransition timed out, proceeding anyway.');
  await sleep(4000);
}

// ════════════════════════════════════════════════════════════════════════════
//  APOLLO.IO
// ════════════════════════════════════════════════════════════════════════════

// Apollo builds its UI with hashed class names that change on every deploy.
// We anchor to structural / semantic attributes that are stable:
//   • a[href*="linkedin.com/in/"]       → LinkedIn profile link (the critical datum)
//   • a[href*="/people/"], a[href*="/contacts/"] → contact's Apollo page (name)
//   • a[href*="/companies/"]            → company name link
//   • table tbody tr                    → each result row
const APOLLO_ROW =
  '[data-cy="contacts-table-row"], ' +
  '[data-testid="contacts-table-row"], ' +
  'table tbody tr';

async function runApolloScraper(): Promise<void> {
  await waitForApolloRows();

  while (leadsExtracted.length < targetLimit) {
    // Scroll container so all rows in this page batch are mounted
    await scrollApolloTable();
    await sleep(700);

    // Extract and deduplicate
    const seen = new Set(leadsExtracted.map(l => l.linkedin_url).filter(Boolean));
    for (const lead of extractApolloLeads()) {
      if (leadsExtracted.length >= targetLimit) break;
      if (lead.linkedin_url && !seen.has(lead.linkedin_url)) {
        seen.add(lead.linkedin_url);
        leadsExtracted.push(lead);
      }
    }

    sendProgress();
    console.log(`[EficacIA Apollo] ${leadsExtracted.length}/${targetLimit}`);

    if (leadsExtracted.length >= targetLimit) break;

    const moved = await goToNextApolloPage();
    if (!moved) {
      console.log('[EficacIA Apollo] No more pages.');
      break;
    }
  }
}

function waitForApolloRows(timeoutMs = 15000): Promise<void> {
  return new Promise(resolve => {
    if (document.querySelector(APOLLO_ROW)) { resolve(); return; }

    const timer = setTimeout(() => {
      observer.disconnect();
      console.warn('[EficacIA Apollo] waitForApolloRows timed out.');
      resolve();
    }, timeoutMs);

    const observer = new MutationObserver(() => {
      if (document.querySelector(APOLLO_ROW)) {
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
  const leads: Lead[] = [];
  const rows = document.querySelectorAll(APOLLO_ROW);

  rows.forEach(row => {
    try {
      // ── LinkedIn URL (critical field) ─────────────────────────────────────
      // Apollo places a LinkedIn icon-anchor in the "Quick Actions" column.
      const linkedinAnchor = row.querySelector<HTMLAnchorElement>(
        'a[href*="linkedin.com/in/"], a[data-cy="linkedin-link"], a[title*="LinkedIn"]'
      );
      if (!linkedinAnchor) return;

      let linkedin_url = linkedinAnchor.href.split('?')[0].split('#')[0];
      const inMatch = linkedin_url.match(/(https?:\/\/(?:www\.)?linkedin\.com\/in\/[^/?#]+)/);
      if (!inMatch) return;
      linkedin_url = inMatch[1] + '/';

      // ── Name ──────────────────────────────────────────────────────────────
      const nameAnchor = row.querySelector<HTMLAnchorElement>(
        'a[href*="/people/"], a[href*="/contacts/"]'
      );
      let fullName = nameAnchor?.textContent?.trim() ?? '';

      // Fallback: first meaningful text in a non-first cell
      if (!fullName) {
        const cells = row.querySelectorAll('td');
        for (let i = 1; i < cells.length; i++) {
          const text = cells[i].textContent?.trim() ?? '';
          if (text && text.length > 1 && !text.includes('@') && !/^\d+$/.test(text)) {
            fullName = text;
            break;
          }
        }
      }

      const nameParts = fullName.split(/\s+/);
      const first_name = nameParts[0] ?? '';
      const last_name = nameParts.slice(1).join(' ') ?? '';
      if (!first_name) return;

      // ── Job Title ─────────────────────────────────────────────────────────
      // Typically the 3rd cell (index 2), after checkbox and name
      const cells = row.querySelectorAll('td');
      const job_title =
        cells[2]?.querySelector('span, div')?.textContent?.trim() ??
        cells[2]?.textContent?.trim() ??
        '';

      // ── Company ───────────────────────────────────────────────────────────
      const companyAnchor = row.querySelector<HTMLAnchorElement>(
        'a[href*="/companies/"], a[data-cy="company-name-link"]'
      );
      const company =
        companyAnchor?.textContent?.trim() ??
        cells[3]?.textContent?.trim() ??
        '';

      // ── Email (if unlocked) ───────────────────────────────────────────────
      let email: string | undefined;
      cells.forEach(cell => {
        const text = cell.textContent?.trim() ?? '';
        if (
          text.includes('@') &&
          text.includes('.') &&
          !text.toLowerCase().includes('unlock') &&
          !text.toLowerCase().includes('reveal') &&
          !email
        ) {
          email = text;
        }
      });

      leads.push({ first_name, last_name, job_title, company, linkedin_url, location: '', email });
    } catch (e) {
      console.warn('[EficacIA Apollo] Parse error', e);
    }
  });

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

async function waitForApolloPageTransition(
  previousFirstRow: Element | null,
  previousUrl: string,
  timeoutMs = 20000
): Promise<void> {
  const start = Date.now();
  await sleep(400); // brief head-start before polling

  while (Date.now() - start < timeoutMs) {
    const urlChanged = window.location.href !== previousUrl;
    const currentFirst = document.querySelector(APOLLO_ROW);
    const rowsGone = !currentFirst;
    const rowReplaced =
      currentFirst !== null &&
      previousFirstRow !== null &&
      currentFirst !== previousFirstRow;

    if (urlChanged || rowsGone || rowReplaced) {
      await waitForApolloRows();
      await sleep(800);
      return;
    }

    await sleep(300);
  }

  console.warn('[EficacIA Apollo] waitForApolloPageTransition timed out.');
  await sleep(3000);
}

// ── Injected "Exportar a Campaña" button ─────────────────────────────────────

function injectApolloExportButton(): void {
  if (document.getElementById('eficacia-export-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'eficacia-export-btn';
  btn.textContent = '⚡ Exportar a Campaña';
  btn.style.cssText = [
    'position:fixed', 'bottom:24px', 'right:24px', 'z-index:2147483647',
    'background:linear-gradient(135deg,#3b82f6,#6366f1)',
    'color:#fff', 'border:none', 'border-radius:12px',
    'padding:12px 20px', 'font-size:14px', 'font-weight:600',
    'cursor:pointer', 'box-shadow:0 4px 24px rgba(99,102,241,.45)',
    'letter-spacing:.3px', 'transition:transform .15s,box-shadow .15s',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    'line-height:1.4',
  ].join(';');

  btn.addEventListener('mouseenter', () => {
    btn.style.transform = 'scale(1.04)';
    btn.style.boxShadow = '0 6px 30px rgba(99,102,241,.6)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.transform = 'scale(1)';
    btn.style.boxShadow = '0 4px 24px rgba(99,102,241,.45)';
  });

  btn.addEventListener('click', async () => {
    if (isScraping) return;

    if (!currentCampaignId || !authToken || !apiBaseUrl) {
      alert('[EficacIA] Abre la extensión y selecciona una campaña antes de exportar.');
      return;
    }

    btn.textContent = '⏳ Exportando...';
    btn.style.opacity = '0.75';
    btn.style.pointerEvents = 'none';

    try {
      await scrollApolloTable();
      await sleep(700);

      const leads = extractApolloLeads();
      if (leads.length === 0) {
        alert('[EficacIA] No se encontraron contactos en la tabla actual. Asegúrate de que la lista de contactos está visible.');
        return;
      }

      chrome.runtime.sendMessage({
        type: 'SUBMIT_LEADS',
        payload: {
          campaign_id: currentCampaignId,
          leads,
          token: authToken,
          backendUrl: apiBaseUrl,
          source: 'apollo',
        },
      });

      btn.textContent = `✓ ${leads.length} leads enviados`;
      btn.style.background = 'linear-gradient(135deg,#10b981,#059669)';
      btn.style.opacity = '1';
      btn.style.pointerEvents = 'auto';

      setTimeout(() => {
        btn.textContent = '⚡ Exportar a Campaña';
        btn.style.background = 'linear-gradient(135deg,#3b82f6,#6366f1)';
      }, 3500);
    } catch (e: any) {
      btn.textContent = '⚡ Exportar a Campaña';
      btn.style.opacity = '1';
      btn.style.pointerEvents = 'auto';
      alert(`[EficacIA] Error: ${e.message}`);
    }
  });

  document.body.appendChild(btn);
}

// ─── Shared Utilities ────────────────────────────────────────────────────────

function sendProgress(): void {
  chrome.runtime.sendMessage({
    type: 'SCRAPING_PROGRESS',
    payload: { progress: Math.min((leadsExtracted.length / targetLimit) * 100, 100) },
  });
  console.log(`[EficacIA] ${leadsExtracted.length}/${targetLimit}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
