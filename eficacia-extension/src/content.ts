// EficacIA Content Script — v2.0 (Background-Driven, Throttle-Immune)
// ╔════════════════════════════════════════════════════════════════════════════╗
// ║  The background service worker now OWNS the clock (chrome.alarms).       ║
// ║  Content script only executes atomic commands: SCROLL / EXTRACT / NEXT.  ║
// ║  No long setTimeout calls here — zero risk of Chrome tab-throttling.     ║
// ╚════════════════════════════════════════════════════════════════════════════╝

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

type Environment = 'sales_navigator' | 'apollo';

// ─── State ────────────────────────────────────────────────────────────────────

let _stopped = false;
let _cmdInFlight = false; // debounce: ignore duplicate commands while one is running

// ─── Message Listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  console.log('[EficacIA v2] Message received:', message.type);

  switch (message.type) {

    // ── Background → Content: atomic commands ─────────────────────────────

    case 'CMD_SCROLL': {
      if (_stopped) return;
      if (_cmdInFlight) {
        console.log('[EficacIA v2] CMD_SCROLL ignored — command already in flight');
        return;
      }
      _cmdInFlight = true;
      humanScrollDown()
        .then(() => chrome.runtime.sendMessage({ type: 'SCROLL_DONE' }))
        .catch(err => console.error('[EficacIA v2] CMD_SCROLL error:', err))
        .finally(() => { _cmdInFlight = false; });
      break;
    }

    case 'CMD_EXTRACT': {
      if (_stopped) return;
      const env = detectEnvironment();
      const leads = env === 'apollo' ? extractApolloLeads() : extractLinkedInLeadsFromPage();
      chrome.runtime.sendMessage({ type: 'EXTRACT_DONE', payload: { leads } }).catch(() => {});
      break;
    }

    case 'CMD_NEXT_PAGE': {
      if (_stopped) {
        chrome.runtime.sendMessage({ type: 'NEXT_PAGE_DONE', payload: { moved: false } }).catch(() => {});
        return;
      }
      if (_cmdInFlight) return;
      _cmdInFlight = true;
      const env = detectEnvironment();
      const nextFn = env === 'apollo' ? goToNextApolloPage : goToNextLinkedInPage;
      nextFn()
        .then(moved => chrome.runtime.sendMessage({ type: 'NEXT_PAGE_DONE', payload: { moved } }))
        .catch(err => {
          console.error('[EficacIA v2] CMD_NEXT_PAGE error:', err);
          chrome.runtime.sendMessage({ type: 'NEXT_PAGE_DONE', payload: { moved: false } }).catch(() => {});
        })
        .finally(() => { _cmdInFlight = false; });
      break;
    }

    case 'CMD_PING': {
      // Reply immediately to keep the message channel alive
      chrome.runtime.sendMessage({ type: 'PONG' }).catch(() => {});
      break;
    }

    // ── Stop signal ────────────────────────────────────────────────────────

    case 'STOP_SCRAPING': {
      console.log('[EficacIA v2] STOP_SCRAPING — halting');
      _stopped = true;
      _cmdInFlight = false;
      break;
    }

    // ── Legacy / backward compat ───────────────────────────────────────────

    case 'RESUME_IF_STALLED': {
      // Watchdog from older background versions — forward a CONTENT_READY signal
      if (!_stopped) {
        chrome.runtime.sendMessage({ type: 'CONTENT_READY', payload: { url: window.location.href } }).catch(() => {});
      }
      break;
    }
  }
});

// ─── Page Load Init ──────────────────────────────────────────────────────────
// After a page navigation (LinkedIn goes to next page), the content script
// re-initialises. Signal the background so it knows the new page is ready.

(function notifyOnLoad() {
  const env = detectEnvironment();
  console.log(`[EficacIA v2] notifyOnLoad — env: ${env} | url: ${window.location.href}`);

  const doNotify = () => {
    _stopped = false; // fresh page — reset stop flag
    chrome.runtime.sendMessage({
      type: 'CONTENT_READY',
      payload: { url: window.location.href },
    }).catch(() => {});
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(doNotify, 800));
  } else {
    setTimeout(doNotify, 800);
  }
})();

// ─── Environment Detection ────────────────────────────────────────────────────

function detectEnvironment(): Environment {
  return window.location.hostname.includes('apollo.io') ? 'apollo' : 'sales_navigator';
}

// ════════════════════════════════════════════════════════════════════════════
//  LINKEDIN SALES NAVIGATOR — EXTRACTION
// ════════════════════════════════════════════════════════════════════════════

function extractLinkedInLeadsFromPage(): Lead[] {
  const leads: Lead[] = [];
  const listItems = document.querySelectorAll('li.artdeco-list__item, .search-results__result-item');
  console.log(`[EficacIA v2] LinkedIn: scanning ${listItems.length} list items`);

  listItems.forEach((item, itemIdx) => {
    try {
      // ── 1. URL (three-tier cascade) ───────────────────────────────────────

      // Tier 1: visible <a> elements (foreground case)
      let linkedin_url =
        item.querySelector<HTMLAnchorElement>('a[href*="/sales/lead/"]')?.href ||
        item.querySelector('[data-anonymize="person-name"]')?.closest('a')?.href ||
        item.querySelector<HTMLAnchorElement>('a[href*="/in/"]')?.href ||
        '';

      // Tier 2: data-id / data-p-id attributes (DOM pruned in background)
      if (!linkedin_url) {
        const dataId =
          item.getAttribute('data-id') ||
          item.getAttribute('data-p-id') ||
          item.querySelector('[data-id]')?.getAttribute('data-id') ||
          item.querySelector('[data-p-id]')?.getAttribute('data-p-id') ||
          '';
        if (dataId) linkedin_url = `https://www.linkedin.com/sales/lead/${dataId}/`;
      }

      // Tier 3: Regex on raw innerHTML — finds the URL even when <a> is not rendered
      // Matches /sales/lead/ACwAAA... or /sales/lead/... profile paths
      if (!linkedin_url) {
        const html = (item as HTMLElement).innerHTML;
        const salesLeadMatch = html.match(/\/sales\/lead\/(ACwA[A-Za-z0-9_-]{6,})[^"'\\s]*/);
        if (salesLeadMatch) {
          linkedin_url = `https://www.linkedin.com/sales/lead/${salesLeadMatch[1]}/`;
          console.log(`[EficacIA v2] Item[${itemIdx}]: URL recovered via innerHTML regex: ${linkedin_url}`);
        }
      }

      // Tier 4: Any /in/ slug in innerHTML
      if (!linkedin_url) {
        const html = (item as HTMLElement).innerHTML;
        const inMatch = html.match(/linkedin\.com\/in\/([A-Za-z0-9_%-]+)/);
        if (inMatch) {
          linkedin_url = `https://www.linkedin.com/in/${inMatch[1]}/`;
          console.log(`[EficacIA v2] Item[${itemIdx}]: /in/ URL recovered via innerHTML regex`);
        }
      }

      if (!linkedin_url) {
        console.log(`[EficacIA v2] Item[${itemIdx}]: No URL found. Skipping.`);
        return;
      }

      if (linkedin_url.includes('?')) linkedin_url = linkedin_url.split('?')[0];
      if (!linkedin_url.endsWith('/')) linkedin_url += '/';

      // ── 2. Name ───────────────────────────────────────────────────────────
      // Always use textContent — never innerText (innerText goes blank in background)
      const personNameEl = item.querySelector('[data-anonymize="person-name"]');
      let rawName =
        personNameEl?.textContent?.trim() ||
        item.getAttribute('data-name') ||
        '';

      if (!rawName) {
        // Anchor text fallback — textContent of profile link anchors
        const profileAnchors = Array.from(
          item.querySelectorAll<HTMLAnchorElement>('a[href*="/sales/lead/"], a[href*="/in/"]')
        );
        for (const a of profileAnchors) {
          const text = a.textContent?.trim() || '';
          if (text.length > 0) { rawName = text; break; }
        }
      }

      if (!rawName) {
        // Last resort: first non-empty line of whole-card textContent
        rawName = item.textContent?.split('\n')[0]?.trim() || '';
      }

      // Strip ARIA / button noise
      rawName = rawName.replace(/est[áa] disponible|Añadir a la selección|Guardar/gi, '').trim();
      const fullName = rawName.split('\n')[0]?.trim() || '';

      if (!fullName) {
        console.log(`[EficacIA v2] Item[${itemIdx}]: Could not extract name. Skipping.`);
        return;
      }

      const nameParts = fullName.split(/\s+/).filter(Boolean);
      let first_name = nameParts[0] || '';
      let last_name = nameParts.slice(1).join(' ') || '';

      // ── 3. Job Title, Company, Location ──────────────────────────────────
      // Use textContent (never innerText) — survives background rendering
      const allText = item.textContent || '';
      const lines = allText
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean);

      const garbageWords = [
        'conectar', 'mensaje', 'guardar', 'connect', 'message', 'save',
        'ver perfil', 'view profile', 'seguir', 'follow', 'invite', 'invitar',
        'enviar mensaje', 'send message', 'más', 'more',
      ];

      const usefulLines = lines.filter(line => {
        const lower = line.toLowerCase();
        if (lower.includes(fullName.toLowerCase())) return false;
        if (/(1st|2nd|3rd|degree|grado|out of network|fuera de la red|conexión|connection)/i.test(lower)) return false;
        if (garbageWords.includes(lower)) return false;
        if (line.length < 2) return false;
        return true;
      });

      let job_title = usefulLines[0] || '';
      let company   = usefulLines[1] || '';
      let location  = usefulLines[2] || '';

      // Truncate to 200 chars (prevents HTTP 400 on backend)
      first_name = first_name.substring(0, 200).trim();
      last_name  = last_name.substring(0, 200).trim();
      job_title  = job_title.substring(0, 200).trim();
      company    = company.substring(0, 200).trim();
      location   = location.substring(0, 200).trim();

      console.log(
        `[EficacIA v2] Item[${itemIdx}]: ✓ ${first_name} ${last_name} | ${job_title} @ ${company} | ${linkedin_url}`
      );

      leads.push({ first_name, last_name, job_title, company, linkedin_url, location });
    } catch (e) {
      console.warn(`[EficacIA v2] LinkedIn item[${itemIdx}] parse error:`, e);
    }
  });

  return leads;
}

// ─── LinkedIn Pagination ──────────────────────────────────────────────────────

async function goToNextLinkedInPage(): Promise<boolean> {
  const nextBtn = (
    document.querySelector<HTMLButtonElement>('button.artdeco-pagination__button--next') ||
    document.querySelector<HTMLButtonElement>('button[aria-label*="Next"]') ||
    document.querySelector<HTMLButtonElement>('button[aria-label*="Siguiente"]') ||
    document.querySelector<HTMLButtonElement>('button.search-results__pagination-next-button')
  );

  if (!nextBtn || nextBtn.disabled) {
    console.log('[EficacIA v2] LinkedIn: next button not found or disabled');
    return false;
  }

  nextBtn.scrollIntoView({ block: 'center' });
  await sleep(300);

  const previousFirstItem = document.querySelector('li.artdeco-list__item, .search-results__result-item');

  try {
    nextBtn.click();
  } catch {
    nextBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  }

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
      // NOTE: NO sleep here — background (WAIT_NEXT phase) handles the post-nav delay
      resolve();
    };

    const check = () => {
      const current = document.querySelector('li.artdeco-list__item, .search-results__result-item');
      if (!current) { done(); return; }
      if (current !== previousFirstItem) { done(); return; }
      if (previousFirstItem === null && current !== null) done();
    };

    const timer = setTimeout(() => {
      observer.disconnect();
      console.warn('[EficacIA v2] LinkedIn: page transition timed out');
      resolve();
    }, timeoutMs);

    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    check();
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  APOLLO.IO — EXTRACTION
// ════════════════════════════════════════════════════════════════════════════

function extractApolloLeads(): Lead[] {
  const links = document.querySelectorAll<HTMLAnchorElement>('a[href*="linkedin.com"]');
  console.log(`[EficacIA v2] Apollo: Found ${links.length} linkedin.com links on page`);

  const seen = new Set<string>();
  const leads: Lead[] = [];

  for (const anchor of links) {
    try {
      if (anchor.href.includes('/company/') || anchor.href.includes('/companies/')) continue;

      const match = anchor.href.match(/(https?:\/\/(?:www\.)?linkedin\.com\/(?:in|sales\/lead)\/[^/?#\s]+)/);
      if (!match) continue;
      const linkedin_url = match[1].replace(/\/$/, '') + '/';
      if (seen.has(linkedin_url)) continue;
      seen.add(linkedin_url);

      const row =
        anchor.closest('.zp_accordion_row') ||
        anchor.closest('.zp_baseRow') ||
        anchor.closest('tr') ||
        anchor.closest('[role="row"]') ||
        anchor.closest('div[class*="Row"]') ||
        climbToRowContainer(anchor);

      if (!row) continue;

      const lead = extractLeadFromRow(row, linkedin_url);
      if (lead) {
        leads.push(lead);
        console.log(`[EficacIA v2] Apollo: ${lead.first_name} ${lead.last_name} | ${lead.job_title} @ ${lead.company}`);
      }
    } catch (e) {
      console.warn('[EficacIA v2] Apollo: Parse error for', anchor.href, e);
    }
  }

  console.log(`[EficacIA v2] Apollo: Total leads from page: ${leads.length}`);
  return leads;
}

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
      if (othersWithLinks.length >= 1) return candidate;
    }
    candidate = parent;
  }
  return null;
}

function extractLeadFromRow(row: Element, linkedin_url: string): Lead | null {
  // ── Name ──
  const nameAnchor = row.querySelector<HTMLAnchorElement>('a[href*="/people/"], a[href*="/contacts/"]');
  let fullName = nameAnchor?.textContent?.trim() ?? '';

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
  let cells = Array.from(row.querySelectorAll('td'));
  if (cells.length < 2) cells = Array.from(row.querySelectorAll(':scope > div'));

  let job_title = '';
  let company = '';

  const companyAnchor = row.querySelector<HTMLAnchorElement>('a[href*="/companies/"], a[data-cy="company-name-link"]');
  company = companyAnchor?.textContent?.trim() ?? '';

  if (cells.length >= 2) {
    let nameCellIdx = nameAnchor ? cells.findIndex(c => c.contains(nameAnchor)) : -1;
    if (nameCellIdx < 0) nameCellIdx = cells.findIndex(c => (c.textContent?.trim() ?? '').includes(first_name));
    if (nameCellIdx < 0) nameCellIdx = 0;
    job_title = cells[nameCellIdx + 1]?.textContent?.trim().split('\n')[0].trim() ?? '';
    if (!company) company = cells[nameCellIdx + 2]?.textContent?.trim().split('\n')[0].trim() ?? '';
  }

  // ── Email ──
  let email: string | undefined;
  const allCells = cells.length > 0 ? cells : Array.from(row.querySelectorAll('td, > div'));
  for (const cell of allCells) {
    const text = cell.textContent?.trim() ?? '';
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) { email = text; break; }
  }

  return { first_name, last_name, job_title, company, linkedin_url, location: '', email };
}

// ─── Apollo Pagination ────────────────────────────────────────────────────────

async function goToNextApolloPage(): Promise<boolean> {
  window.scrollTo(0, document.body.scrollHeight);
  await sleep(1000);

  const nextBtn = findApolloNextButton();
  if (!nextBtn) {
    console.log('[EficacIA v2] Apollo: next button not found');
    return false;
  }

  const previousUrl = window.location.href;
  const previousFirstRow = document.querySelector(
    'table tbody tr, [role="row"], .zp_accordion_row, .zp_baseRow'
  );

  nextBtn.click();
  await waitForApolloPageTransition(previousFirstRow, previousUrl);
  return true;
}

function findApolloNextButton(): HTMLButtonElement | HTMLAnchorElement | null {
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
    if (btn && !btn.hasAttribute('disabled') && btn.getAttribute('aria-disabled') !== 'true') return btn;
  }

  const iconBtns = document.querySelectorAll<HTMLButtonElement>(
    'button:has(i[class*="chevron-right"]), ' +
    'button:has(i[class*="arrow-right"]), ' +
    'button:has(svg[class*="right"]), ' +
    '.zp-button:has(.zp-icon-chevron-right)'
  );
  for (const btn of iconBtns) {
    if (!btn.disabled && btn.getAttribute('aria-disabled') !== 'true') return btn;
  }

  const containers = document.querySelectorAll(
    '[class*="pagination"], [class*="Pagination"], [role="navigation"], [class*="pager"]'
  );
  for (const container of containers) {
    const buttons = [...container.querySelectorAll<HTMLButtonElement>('button, a')];
    const nextLike = buttons.find(b => {
      if ((b as HTMLButtonElement).disabled || b.getAttribute('aria-disabled') === 'true') return false;
      const text = b.textContent?.trim() ?? '';
      const label = (b.getAttribute('aria-label') ?? '').toLowerCase();
      const cls = (b.className ?? '').toLowerCase();
      return text === '>' || text === '›' || text === '»' || label.includes('next') || cls.includes('next');
    });
    if (nextLike) return nextLike as HTMLButtonElement;

    const last = [...buttons].reverse().find(
      b => !(b as HTMLButtonElement).disabled && b.getAttribute('aria-disabled') !== 'true'
    );
    if (last) return last as HTMLButtonElement;
  }

  const allButtons = document.querySelectorAll<HTMLButtonElement>('button');
  for (const btn of allButtons) {
    if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') continue;
    const icon = btn.querySelector('i, svg');
    if (icon && /(right|forward|next)/i.test(icon.className)) return btn;
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
      await sleep(800); // Short stabilisation — fine (not throttled at < 1s)
      resolve();
    };

    const check = () => {
      if (window.location.href !== previousUrl) { done(); return; }
      const current = document.querySelector(
        'table tbody tr, [role="row"], .zp_accordion_row, .zp_baseRow'
      );
      if (!current) { done(); return; }
      if (current !== previousFirstRow) done();
    };

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        observer.disconnect();
        console.warn('[EficacIA v2] Apollo: page transition timed out');
        sleep(1000).then(resolve);
      }
    }, timeoutMs);

    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    sleep(400).then(check);
  });
}

function waitForApolloRows(timeoutMs = 20000): Promise<void> {
  const isReady = () =>
    !!document.querySelector('a[href*="linkedin.com"]') ||
    !!document.querySelector('table tbody tr') ||
    !!document.querySelector('[role="row"]') ||
    !!document.querySelector('.zp_accordion_row, .zp_baseRow, [class*="Row"]');

  return new Promise(resolve => {
    if (isReady()) { resolve(); return; }

    const timer = setTimeout(() => {
      observer.disconnect();
      console.warn('[EficacIA v2] waitForApolloRows timed out');
      resolve();
    }, timeoutMs);

    const observer = new MutationObserver(() => {
      if (isReady()) { clearTimeout(timer); observer.disconnect(); resolve(); }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

// ─── Apollo Scroll ────────────────────────────────────────────────────────────

async function scrollApolloTable(): Promise<void> {
  const container =
    document.querySelector<HTMLElement>('[class*="table_wrapper"], [class*="tableWrapper"], .infinite-scroll-component') ??
    document.querySelector<HTMLElement>('main, [role="main"]') ??
    document.documentElement;

  let prev = -1;
  let stable = 0;

  while (stable < 2) {
    const h = container.scrollHeight;
    // Use direct assignment — does not depend on Chrome rendering the scroll
    container.scrollTop = h;
    window.scrollTo(0, document.body.scrollHeight);
    if (h === prev) { stable++; } else { stable = 0; prev = h; }
    await sleep(600); // 600ms — well below throttling threshold
  }
  await sleep(400);
}

// ─── LinkedIn Scroll ──────────────────────────────────────────────────────────

function findScrollableContainer(): HTMLElement {
  const byId = document.querySelector<HTMLElement>('#search-results-container');
  if (byId) return byId;

  const byAria = document.querySelector('[aria-label="Search results"]')?.parentElement as HTMLElement | null;
  if (byAria) return byAria;

  const firstCard = document.querySelector<HTMLElement>('li.artdeco-list__item, .search-results__result-item');
  if (firstCard) {
    let el: HTMLElement | null = firstCard.parentElement;
    while (el && el !== document.documentElement) {
      const { overflow, overflowY } = window.getComputedStyle(el);
      if (/(auto|scroll)/.test(overflow + overflowY) && el.scrollHeight > el.clientHeight) return el;
      el = el.parentElement;
    }
  }

  return document.documentElement;
}

async function humanScrollDown(): Promise<void> {
  // Dispatch to Apollo-specific scroll if on Apollo
  if (detectEnvironment() === 'apollo') {
    await scrollApolloTable();
    return;
  }

  const container = findScrollableContainer();
  const isRoot = container === document.documentElement;

  console.log(
    `[EficacIA v2] Scrolling <${container.tagName} id="${container.id}" class="${container.className.slice(0, 60)}">`
  );

  // Reset to top
  if (isRoot) window.scrollTo(0, 0); else container.scrollTop = 0;
  await sleep(100);

  // Scroll through in steps using direct scrollTop assignment (force-scroll, no rendering required)
  const totalHeight = () => isRoot ? document.documentElement.scrollHeight : container.scrollHeight;

  for (let step = 1; step <= 6; step++) {
    const target = Math.floor(totalHeight() * (step / 6));
    if (isRoot) window.scrollTo(0, target); else container.scrollTop = target;
    await sleep(80); // 80ms per step — below any throttling threshold
  }

  console.log('[EficacIA v2] ✅ Scroll completo.');
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
