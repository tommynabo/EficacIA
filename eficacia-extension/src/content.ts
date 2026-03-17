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

      // 3. Go to next page if needed
      const movedToNext = await goToNextPage();
      if (!movedToNext) {
        console.log("[EficacIA] No more pages found or reached the end.");
        break;
      }
      
      // Wait for page load
      await new Promise(r => setTimeout(r, 4000));
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

async function scrollToBottom() {
  const distance = 400;
  const delay = 200;
  
  const scrollElement = document.querySelector('.search-results__result-list') || document.scrollingElement || document.documentElement;
  
  let currentScroll = 0;
  const maxScroll = scrollElement.scrollHeight;
  
  while (currentScroll < maxScroll) {
    window.scrollBy(0, distance);
    currentScroll += distance;
    await new Promise(r => setTimeout(r, delay));
    
    // Check if we already reached the actual bottom (dynamic content)
    if (currentScroll % 2000 === 0) {
        // Pause briefly to allow items to render
        await new Promise(r => setTimeout(r, 500));
    }
  }
  
  await new Promise(r => setTimeout(r, 1500));
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
  const nextBtn = document.querySelector('.artdeco-pagination__button--next') as HTMLButtonElement;
  
  if (nextBtn && !nextBtn.disabled) {
    nextBtn.click();
    return true;
  }
  
  const fallbackNext = document.querySelector('button.search-results__pagination-next-button') as HTMLButtonElement;
  if (fallbackNext && !fallbackNext.disabled) {
    fallbackNext.click();
    return true;
  }
  
  return false;
}
