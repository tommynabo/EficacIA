// src/background.ts
function ensureWatchdogAlarm() {
  chrome.alarms.get("eficacia_watchdog", (existing) => {
    if (!existing) {
      chrome.alarms.create("eficacia_watchdog", { periodInMinutes: 1 });
    }
  });
}
chrome.runtime.onInstalled.addListener(() => {
  console.log("EficacIA Extension Installed");
  ensureWatchdogAlarm();
});
chrome.runtime.onStartup.addListener(ensureWatchdogAlarm);
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "eficacia_watchdog")
    return;
  const result = await chrome.storage.local.get("eficacia_active_task");
  const task = result["eficacia_active_task"];
  if (!task?.active)
    return;
  const urlPattern = task.platform === "apollo" ? "*://app.apollo.io/*" : "*://*.linkedin.com/sales/*";
  const tabs = await chrome.tabs.query({ url: urlPattern });
  for (const tab of tabs) {
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, { type: "RESUME_IF_STALLED" }).catch(() => {
      });
    }
  }
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SUBMIT_LEADS") {
    const { campaign_id, leads, token, backendUrl, source } = message.payload;
    submitLeads(campaign_id, leads, token, backendUrl, source).then(() => {
      chrome.runtime.sendMessage({ type: "SCRAPING_FINISHED" });
    }).catch((error) => {
      chrome.runtime.sendMessage({
        type: "SCRAPING_ERROR",
        payload: { error: error.message || "Error al enviar leads al servidor" }
      });
    });
    return true;
  }
});
async function submitLeads(campaign_id, leads, token, backendUrl, source) {
  console.log(`[EficacIA Background] Submitting ${leads.length} leads (source: ${source ?? "extension"}) to ${backendUrl}...`);
  const response = await fetch(`${backendUrl}/api/linkedin/bulk-import`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      type: "extension",
      campaign_id,
      leads,
      ...source ? { source } : {}
    })
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Error del servidor: ${response.status}`);
  }
  console.log("[EficacIA Background] Bulk import successful!");
}
