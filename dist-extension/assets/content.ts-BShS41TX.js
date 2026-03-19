// src/content.ts
var APOLLO_ROW = '[data-cy="contacts-table-row"], [data-testid="contacts-table-row"], table tbody tr';
var TASK_KEY = "eficacia_active_task";
var CONFIG_KEY = "eficacia_last_config";
function getTask() {
  return new Promise(
    (r) => chrome.storage.local.get(TASK_KEY, (s) => r(s[TASK_KEY] ?? null))
  );
}
function saveTask(task) {
  return new Promise((r) => chrome.storage.local.set({ [TASK_KEY]: task }, r));
}
function clearTask() {
  return new Promise((r) => chrome.storage.local.remove([TASK_KEY], r));
}
function getLastConfig() {
  return new Promise(
    (r) => chrome.storage.local.get(CONFIG_KEY, (s) => r(s[CONFIG_KEY] ?? null))
  );
}
var _running = false;
chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  if (message.type === "START_SCRAPING") {
    const { campaign_id, limit, token, backendUrl } = message.payload;
    const task = {
      active: true,
      platform: detectEnvironment(),
      campaign_id,
      limit,
      token,
      backendUrl,
      leads: []
    };
    const config = { campaign_id, token, backendUrl };
    chrome.storage.local.set({ [TASK_KEY]: task, [CONFIG_KEY]: config }, () => {
      if (!_running)
        startScrapingProcess();
    });
  }
  if (message.type === "RESUME_IF_STALLED") {
    if (!_running)
      startScrapingProcess();
  }
});
(function init() {
  if (!window.location.hostname.includes("apollo.io"))
    return;
  const tryInject = () => {
    if (document.querySelector('table, [class*="zp_"]')) {
      injectApolloExportButton();
    } else {
      setTimeout(tryInject, 1200);
    }
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", tryInject);
  } else {
    tryInject();
  }
  let lastHref = window.location.href;
  new MutationObserver(() => {
    if (window.location.href !== lastHref) {
      lastHref = window.location.href;
      setTimeout(() => {
        const existing = document.getElementById("eficacia-export-btn");
        if (existing)
          existing.remove();
        injectApolloExportButton();
      }, 1500);
    }
  }).observe(document.body, { childList: true, subtree: true });
})();
(function resumeOnLoad() {
  const env = detectEnvironment();
  chrome.storage.local.get(TASK_KEY, (result) => {
    const task = result[TASK_KEY];
    if (!task?.active)
      return;
    if (task.platform !== env)
      return;
    console.log(`[EficacIA] Auto-resuming: ${task.leads.length}/${task.limit} leads collected`);
    const waitThenResume = () => {
      if (_running)
        return;
      const ready = env === "apollo" ? !!document.querySelector(APOLLO_ROW) : !!document.querySelector("li.artdeco-list__item, .search-results__result-item");
      if (ready) {
        startScrapingProcess();
      } else {
        setTimeout(waitThenResume, 1e3);
      }
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => setTimeout(waitThenResume, 1500));
    } else {
      setTimeout(waitThenResume, 1500);
    }
  });
})();
function detectEnvironment() {
  return window.location.hostname.includes("apollo.io") ? "apollo" : "sales_navigator";
}
async function startScrapingProcess() {
  if (_running)
    return;
  const task = await getTask();
  if (!task?.active)
    return;
  _running = true;
  console.log(`[EficacIA] Env: ${task.platform} | Target: ${task.limit} | Have: ${task.leads.length}`);
  try {
    if (task.platform === "apollo") {
      await runApolloScraper(task);
    } else {
      await runLinkedInScraper(task);
    }
    const finalTask = await getTask();
    if (!finalTask)
      return;
    chrome.runtime.sendMessage({
      type: "SUBMIT_LEADS",
      payload: {
        campaign_id: finalTask.campaign_id,
        leads: finalTask.leads,
        token: finalTask.token,
        backendUrl: finalTask.backendUrl,
        source: finalTask.platform
      }
    });
    await clearTask();
  } catch (error) {
    console.error("[EficacIA] Scraping error:", error);
    chrome.runtime.sendMessage({
      type: "SCRAPING_ERROR",
      payload: { error: error.message }
    });
    await clearTask();
  } finally {
    _running = false;
  }
}
async function runLinkedInScraper(task) {
  while (task.leads.length < task.limit) {
    await scrollToBottom();
    const seen = new Set(task.leads.map((l) => l.linkedin_url));
    for (const lead of extractLeadsFromPage()) {
      if (task.leads.length >= task.limit)
        break;
      if (!seen.has(lead.linkedin_url)) {
        seen.add(lead.linkedin_url);
        task.leads.push(lead);
      }
    }
    await saveTask(task);
    sendProgress(task);
    if (task.leads.length >= task.limit)
      break;
    const movedToNext = await goToNextPage();
    if (!movedToNext) {
      console.log("[EficacIA LI] No more pages.");
      break;
    }
  }
}
async function scrollToBottom() {
  const scrollEl = document.querySelector(".search-results__result-list") || document.scrollingElement || document.documentElement;
  let previousHeight = -1;
  let stableRounds = 0;
  const STABLE_NEEDED = 3;
  while (stableRounds < STABLE_NEEDED) {
    const currentHeight = scrollEl.scrollHeight;
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
function extractLeadsFromPage() {
  const leads = [];
  const listItems = document.querySelectorAll("li.artdeco-list__item, .search-results__result-item");
  listItems.forEach((item) => {
    try {
      const nameEl = item.querySelector('[data-anonymize="person-name"], .result-lockup__name a');
      const profileLink = item.querySelector('a[data-control-name="view_profile"], .result-lockup__name a');
      if (nameEl && profileLink) {
        const fullName = nameEl.textContent?.trim() || "";
        const parts = fullName.split(" ");
        const first_name = parts[0] || "";
        const last_name = parts.slice(1).join(" ") || "";
        const titleEl = item.querySelector('[data-anonymize="job-title"], .result-lockup__highlight-keyword');
        const companyEl = item.querySelector('[data-anonymize="company-name"], .result-lockup__position-company');
        const locationEl = item.querySelector('[data-anonymize="location"], .result-lockup__location');
        let linkedin_url = profileLink.href;
        if (linkedin_url.includes("?"))
          linkedin_url = linkedin_url.split("?")[0];
        leads.push({
          first_name,
          last_name,
          job_title: titleEl?.textContent?.trim() || "",
          company: companyEl?.textContent?.trim() || "",
          linkedin_url,
          location: locationEl?.textContent?.trim() || ""
        });
      }
    } catch (e) {
      console.warn("[EficacIA LI] Parsing error", e);
    }
  });
  return leads;
}
async function goToNextPage() {
  const nextBtn = document.querySelector(".artdeco-pagination__button--next") || document.querySelector("button.search-results__pagination-next-button");
  if (!nextBtn || nextBtn.disabled)
    return false;
  const previousFirstItem = document.querySelector(
    "li.artdeco-list__item, .search-results__result-item"
  );
  nextBtn.click();
  await waitForLinkedInPageTransition(previousFirstItem);
  return true;
}
function waitForLinkedInPageTransition(previousFirstItem, timeoutMs = 18e3) {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      observer.disconnect();
      sleep(1500).then(resolve);
    };
    const check = () => {
      const current = document.querySelector(
        "li.artdeco-list__item, .search-results__result-item"
      );
      if (!current) {
        done();
        return;
      }
      if (current !== previousFirstItem) {
        done();
        return;
      }
      if (previousFirstItem === null && current !== null)
        done();
    };
    const timer = setTimeout(() => {
      observer.disconnect();
      console.warn("[EficacIA LI] waitForPageTransition timed out.");
      sleep(4e3).then(resolve);
    }, timeoutMs);
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    check();
  });
}
async function runApolloScraper(task) {
  await waitForApolloRows();
  while (task.leads.length < task.limit) {
    await scrollApolloTable();
    await sleep(700);
    const seen = new Set(task.leads.map((l) => l.linkedin_url).filter(Boolean));
    for (const lead of extractApolloLeads()) {
      if (task.leads.length >= task.limit)
        break;
      if (lead.linkedin_url && !seen.has(lead.linkedin_url)) {
        seen.add(lead.linkedin_url);
        task.leads.push(lead);
      }
    }
    await saveTask(task);
    sendProgress(task);
    console.log(`[EficacIA Apollo] ${task.leads.length}/${task.limit}`);
    if (task.leads.length >= task.limit)
      break;
    const moved = await goToNextApolloPage();
    if (!moved) {
      console.log("[EficacIA Apollo] No more pages.");
      break;
    }
  }
}
function waitForApolloRows(timeoutMs = 15e3) {
  return new Promise((resolve) => {
    if (document.querySelector(APOLLO_ROW)) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      observer.disconnect();
      console.warn("[EficacIA Apollo] waitForApolloRows timed out.");
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
async function scrollApolloTable() {
  const container = document.querySelector('[class*="table_wrapper"], [class*="tableWrapper"], .infinite-scroll-component') ?? document.querySelector('main, [role="main"]') ?? document.documentElement;
  let prev = -1;
  let stable = 0;
  while (stable < 2) {
    const h = container.scrollHeight;
    container.scrollTop = h;
    window.scrollTo(0, document.body.scrollHeight);
    if (h === prev) {
      stable++;
    } else {
      stable = 0;
      prev = h;
    }
    await sleep(600);
  }
  await sleep(500);
}
function extractApolloLeads() {
  const leads = [];
  const rows = document.querySelectorAll(APOLLO_ROW);
  rows.forEach((row) => {
    try {
      const linkedinAnchor = row.querySelector(
        'a[href*="linkedin.com/in/"], a[data-cy="linkedin-link"], a[title*="LinkedIn"]'
      );
      if (!linkedinAnchor)
        return;
      let linkedin_url = linkedinAnchor.href.split("?")[0].split("#")[0];
      const inMatch = linkedin_url.match(/(https?:\/\/(?:www\.)?linkedin\.com\/in\/[^/?#]+)/);
      if (!inMatch)
        return;
      linkedin_url = inMatch[1] + "/";
      const nameAnchor = row.querySelector(
        'a[href*="/people/"], a[href*="/contacts/"]'
      );
      let fullName = nameAnchor?.textContent?.trim() ?? "";
      if (!fullName) {
        const cells2 = row.querySelectorAll("td");
        for (let i = 1; i < cells2.length; i++) {
          const text = cells2[i].textContent?.trim() ?? "";
          if (text && text.length > 1 && !text.includes("@") && !/^\d+$/.test(text)) {
            fullName = text;
            break;
          }
        }
      }
      const nameParts = fullName.split(/\s+/);
      const first_name = nameParts[0] ?? "";
      const last_name = nameParts.slice(1).join(" ") ?? "";
      if (!first_name)
        return;
      const cells = row.querySelectorAll("td");
      const job_title = cells[2]?.querySelector("span, div")?.textContent?.trim() ?? cells[2]?.textContent?.trim() ?? "";
      const companyAnchor = row.querySelector(
        'a[href*="/companies/"], a[data-cy="company-name-link"]'
      );
      const company = companyAnchor?.textContent?.trim() ?? cells[3]?.textContent?.trim() ?? "";
      let email;
      cells.forEach((cell) => {
        const text = cell.textContent?.trim() ?? "";
        if (text.includes("@") && text.includes(".") && !text.toLowerCase().includes("unlock") && !text.toLowerCase().includes("reveal") && !email) {
          email = text;
        }
      });
      leads.push({ first_name, last_name, job_title, company, linkedin_url, location: "", email });
    } catch (e) {
      console.warn("[EficacIA Apollo] Parse error", e);
    }
  });
  return leads;
}
async function goToNextApolloPage() {
  const nextBtn = findApolloNextButton();
  if (!nextBtn)
    return false;
  const previousUrl = window.location.href;
  const previousFirstRow = document.querySelector(APOLLO_ROW);
  nextBtn.click();
  await waitForApolloPageTransition(previousFirstRow, previousUrl);
  return true;
}
function findApolloNextButton() {
  const byAttr = document.querySelector(
    'button[data-cy="next-page-button"], button[aria-label="next page"], button[aria-label="Next page"], a[aria-label="next page"], button[title="Next page"]'
  );
  if (byAttr && !byAttr.hasAttribute("disabled") && byAttr.getAttribute("aria-disabled") !== "true") {
    return byAttr;
  }
  const containers = document.querySelectorAll('[class*="pagination"], [class*="Pagination"], [role="navigation"]');
  for (const container of containers) {
    const buttons = [...container.querySelectorAll("button")];
    const nextLike = buttons.find((b) => {
      if (b.disabled || b.getAttribute("aria-disabled") === "true")
        return false;
      const text = b.textContent?.trim() ?? "";
      const label = (b.getAttribute("aria-label") ?? "").toLowerCase();
      return text === ">" || text === "\u203A" || text === "\xBB" || label.includes("next");
    });
    if (nextLike)
      return nextLike;
    const last = [...buttons].reverse().find(
      (b) => !b.disabled && b.getAttribute("aria-disabled") !== "true"
    );
    if (last)
      return last;
  }
  return null;
}
function waitForApolloPageTransition(previousFirstRow, previousUrl, timeoutMs = 2e4) {
  return new Promise((resolve) => {
    let settled = false;
    const done = async () => {
      if (settled)
        return;
      settled = true;
      clearTimeout(timer);
      observer.disconnect();
      await waitForApolloRows();
      await sleep(800);
      resolve();
    };
    const check = () => {
      if (window.location.href !== previousUrl) {
        done();
        return;
      }
      const current = document.querySelector(APOLLO_ROW);
      if (!current) {
        done();
        return;
      }
      if (current !== previousFirstRow)
        done();
    };
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        observer.disconnect();
        console.warn("[EficacIA Apollo] waitForApolloPageTransition timed out.");
        sleep(3e3).then(resolve);
      }
    }, timeoutMs);
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    sleep(400).then(check);
  });
}
function injectApolloExportButton() {
  if (document.getElementById("eficacia-export-btn"))
    return;
  const btn = document.createElement("button");
  btn.id = "eficacia-export-btn";
  btn.textContent = "\u26A1 Exportar a Campa\xF1a";
  btn.style.cssText = [
    "position:fixed",
    "bottom:24px",
    "right:24px",
    "z-index:2147483647",
    "background:linear-gradient(135deg,#3b82f6,#6366f1)",
    "color:#fff",
    "border:none",
    "border-radius:12px",
    "padding:12px 20px",
    "font-size:14px",
    "font-weight:600",
    "cursor:pointer",
    "box-shadow:0 4px 24px rgba(99,102,241,.45)",
    "letter-spacing:.3px",
    "transition:transform .15s,box-shadow .15s",
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    "line-height:1.4"
  ].join(";");
  btn.addEventListener("mouseenter", () => {
    btn.style.transform = "scale(1.04)";
    btn.style.boxShadow = "0 6px 30px rgba(99,102,241,.6)";
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.transform = "scale(1)";
    btn.style.boxShadow = "0 4px 24px rgba(99,102,241,.45)";
  });
  btn.addEventListener("click", async () => {
    if (_running)
      return;
    const config = await getLastConfig();
    if (!config?.campaign_id || !config?.token || !config?.backendUrl) {
      alert("[EficacIA] Abre la extensi\xF3n y selecciona una campa\xF1a antes de exportar.");
      return;
    }
    btn.textContent = "\u23F3 Exportando...";
    btn.style.opacity = "0.75";
    btn.style.pointerEvents = "none";
    try {
      await scrollApolloTable();
      await sleep(700);
      const leads = extractApolloLeads();
      if (leads.length === 0) {
        alert("[EficacIA] No se encontraron contactos en la tabla actual. Aseg\xFArate de que la lista de contactos est\xE1 visible.");
        btn.textContent = "\u26A1 Exportar a Campa\xF1a";
        btn.style.opacity = "1";
        btn.style.pointerEvents = "auto";
        return;
      }
      chrome.runtime.sendMessage({
        type: "SUBMIT_LEADS",
        payload: {
          campaign_id: config.campaign_id,
          leads,
          token: config.token,
          backendUrl: config.backendUrl,
          source: "apollo"
        }
      });
      btn.textContent = `\u2713 ${leads.length} leads enviados`;
      btn.style.background = "linear-gradient(135deg,#10b981,#059669)";
      btn.style.opacity = "1";
      btn.style.pointerEvents = "auto";
      setTimeout(() => {
        btn.textContent = "\u26A1 Exportar a Campa\xF1a";
        btn.style.background = "linear-gradient(135deg,#3b82f6,#6366f1)";
      }, 3500);
    } catch (e) {
      btn.textContent = "\u26A1 Exportar a Campa\xF1a";
      btn.style.opacity = "1";
      btn.style.pointerEvents = "auto";
      alert(`[EficacIA] Error: ${e.message}`);
    }
  });
  document.body.appendChild(btn);
}
function sendProgress(task) {
  chrome.runtime.sendMessage({
    type: "SCRAPING_PROGRESS",
    payload: { progress: Math.min(task.leads.length / task.limit * 100, 100) }
  });
  console.log(`[EficacIA] ${task.leads.length}/${task.limit}`);
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
