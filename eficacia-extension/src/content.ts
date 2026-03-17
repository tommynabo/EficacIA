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
      await new Promise(r => setTimeout(r, 3000));
    }

    // 4. Send data to backend
    await sendLeadsToBackend();

    chrome.runtime.sendMessage({ type: 'SCRAPING_FINISHED' });
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
  const distance = 100;
  const delay = 100;
  while (document.scrollingElement && document.scrollingElement.scrollTop + window.innerHeight < document.scrollingElement.scrollHeight) {
    window.scrollBy(0, distance);
    await new Promise(r => setTimeout(r, delay));
  }
  // Extra wait for images/async content
  await new Promise(r => setTimeout(r, 1000));
}

function extractLeadsFromPage(): Lead[] {
  const leads: Lead[] = [];
  // Sales Navigator selector for search result items
  const items = document.querySelectorAll('li.artdeco-list__item, .search-results__result-item');
  
  items.forEach(item => {
    try {
      const nameEl = item.querySelector('[data-anonymize="person-name"], .result-lockup__name a');
      const titleEl = item.querySelector('[data-anonymize="job-title"], .result-lockup__highlight-keyword');
      const companyEl = item.querySelector('[data-anonymize="company-name"], .result-lockup__position-company');
      const locationEl = item.querySelector('[data-anonymize="location"], .result-lockup__location');
      const profileLink = item.querySelector('a[data-control-name="view_profile"], .result-lockup__name a') as HTMLAnchorElement;

      if (nameEl && profileLink) {
        const fullName = nameEl.textContent?.trim() || "";
        const [first_name, ...lastParts] = fullName.split(" ");
        const last_name = lastParts.join(" ");

        // Clean LinkedIn URL
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
      console.warn("[EficacIA] Skipped a lead due to parsing error", e);
    }
  });

  return leads;
}

async function goToNextPage(): Promise<boolean> {
  const nextButton = document.querySelector('button.search-results__pagination-next-button, .artdeco-pagination__button--next') as HTMLButtonElement;
  if (nextButton && !nextButton.disabled) {
    nextButton.click();
    return true;
  }
  return false;
}

async function sendLeadsToBackend() {
  console.log(`[EficacIA] Sending ${leadsExtracted.length} leads to backend...`);
  
  const response = await fetch(`${apiBaseUrl}/api/linkedin/bulk-import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({
      campaign_id: currentCampaignId,
      leads: leadsExtracted
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Backend error: ${response.status}`);
  }

  console.log("[EficacIA] Sync complete!");
}
