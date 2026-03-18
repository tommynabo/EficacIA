// EficacIA Content Script - LinkedIn Sales Navigator Scraper

interface Lead {
  first_name: string;
  last_name: string;
  job_title: string;
  company: string;
  linkedin_url: string;
  location: string;
}

let isScraping = false;
let leadsExtracted: Lead[] = [];
let targetLimit = 0;
let currentCampaignId = '';
let authToken = '';
let apiBaseUrl = '';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_SCRAPING') {
    const { campaign_id, limit, token, backendUrl } = message.payload;
    currentCampaignId = campaign_id;
    targetLimit = limit;
    authToken = token;
    apiBaseUrl = backendUrl;
    
    if (!isScraping) {
      startScrapingProcess();
    }
  }
});

async function startScrapingProcess() {
  isScraping = true;
  leadsExtracted = [];
  
  console.log(`[EficacIA] Starting scraping for ${targetLimit} leads...`);

  try {
    while (leadsExtracted.length < targetLimit) {
      // 1. Scroll to the bottom to load all elements
      await scrollToBottom();
      
      // 2. Extract visible leads
      const newLeads = extractLeadsFromPage();
      
      for (const lead of newLeads) {
        if (leadsExtracted.length < targetLimit) {
          // Avoid duplicates in the same session
          if (!leadsExtracted.find(l => l.linkedin_url === lead.linkedin_url)) {
            leadsExtracted.push(lead);
          }
        }
      }

      // Update progress
      const progress = (leadsExtracted.length / targetLimit) * 100;
      chrome.runtime.sendMessage({ 
        type: 'SCRAPING_PROGRESS', 
        payload: { progress } 
      });

      console.log(`[EficacIA] Progress: ${leadsExtracted.length}/${targetLimit}`);

      if (leadsExtracted.length >= targetLimit) break;

      // 3. Go to next page if needed (waits for DOM transition internally)
      const movedToNext = await goToNextPage();
      if (!movedToNext) {
        console.log("[EficacIA] No more pages found or reached the end.");
        break;
      }
    }

    // 4. Send data to background
    chrome.runtime.sendMessage({ 
      type: 'SUBMIT_LEADS',
      payload: {
        campaign_id: currentCampaignId,
        leads: leadsExtracted,
        token: authToken,
        backendUrl: apiBaseUrl
      }
    });

  } catch (error: any) {
    console.error("[EficacIA] Scraping error:", error);
    chrome.runtime.sendMessage({ 
      type: 'SCRAPING_ERROR', 
      payload: { error: error.message } 
    });
  } finally {
    isScraping = false;
  }
}

async function scrollToBottom(): Promise<void> {
  const scrollEl =
    document.querySelector('.search-results__result-list') ||
    document.scrollingElement ||
    document.documentElement;

  let previousHeight = -1;
  let stableRounds = 0;
  const STABLE_NEEDED = 3; // consecutive rounds with no height growth

  while (stableRounds < STABLE_NEEDED) {
    const currentHeight = (scrollEl as HTMLElement).scrollHeight;
    window.scrollTo(0, currentHeight);

    if (currentHeight === previousHeight) {
      stableRounds++;
    } else {
      stableRounds = 0;
      previousHeight = currentHeight;
    }

    // Slightly longer pause when new content just appeared to let it fully render
    await new Promise(r => setTimeout(r, stableRounds === 0 ? 800 : 400));
  }

  // Final grace period for any trailing lazy images / hydration
  await new Promise(r => setTimeout(r, 1200));
}

function extractLeadsFromPage(): Lead[] {
  const leads: Lead[] = [];
  const listItems = document.querySelectorAll('li.artdeco-list__item, .search-results__result-item');
  
  listItems.forEach(item => {
    try {
      const nameEl = item.querySelector('[data-anonymize="person-name"], .result-lockup__name a');
      const profileLink = item.querySelector('a[data-control-name="view_profile"], .result-lockup__name a') as HTMLAnchorElement;

      if (nameEl && profileLink) {
        const fullName = nameEl.textContent?.trim() || "";
        const parts = fullName.split(" ");
        const first_name = parts[0] || "";
        const last_name = parts.slice(1).join(" ") || "";

        const titleEl = item.querySelector('[data-anonymize="job-title"], .result-lockup__highlight-keyword');
        const companyEl = item.querySelector('[data-anonymize="company-name"], .result-lockup__position-company');
        const locationEl = item.querySelector('[data-anonymize="location"], .result-lockup__location');

        let linkedin_url = profileLink.href;
        if (linkedin_url.includes('?')) {
          linkedin_url = linkedin_url.split('?')[0];
        }

        leads.push({
          first_name,
          last_name,
          job_title: titleEl?.textContent?.trim() || "",
          company: companyEl?.textContent?.trim() || "",
          linkedin_url: linkedin_url,
          location: locationEl?.textContent?.trim() || ""
        });
      }
    } catch (e) {
      console.warn("[EficacIA] Parsing error", e);
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

  // Snapshot the current first result so we can detect when the DOM has
  // been replaced by the new page's results.
  const previousFirstItem = document.querySelector(
    'li.artdeco-list__item, .search-results__result-item'
  );

  nextBtn.click();

  await waitForPageTransition(previousFirstItem);
  return true;
}

/**
 * Waits until the DOM list is replaced after a pagination click.
 * Falls back to a generous fixed delay if the transition isn't detected
 * within `timeoutMs` milliseconds.
 */
async function waitForPageTransition(
  previousFirstItem: Element | null,
  timeoutMs = 18000
): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const currentFirstItem = document.querySelector(
      'li.artdeco-list__item, .search-results__result-item'
    );

    // Detect: results list disappeared (loading state) OR a new first item appeared
    const listGone = !currentFirstItem;
    const itemChanged =
      currentFirstItem !== null &&
      previousFirstItem !== null &&
      currentFirstItem !== previousFirstItem;
    const hadNoItemsBefore = previousFirstItem === null && currentFirstItem !== null;

    if (listGone || itemChanged || hadNoItemsBefore) {
      // Give the new page a moment to fully hydrate before we start scrolling
      await new Promise(r => setTimeout(r, 1500));
      return;
    }

    await new Promise(r => setTimeout(r, 250));
  }

  // Timeout: page never clearly transitioned — wait a fallback duration
  console.warn('[EficacIA] waitForPageTransition timed out, proceeding anyway.');
  await new Promise(r => setTimeout(r, 4000));
}
