// EficacIA Background Service Worker

chrome.runtime.onInstalled.addListener(() => {
  console.log('EficacIA Extension Installed (Bolt Branding)');
});

// Listener for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SUBMIT_LEADS') {
    const { campaign_id, leads, token, backendUrl, source } = message.payload;
    
    submitLeads(campaign_id, leads, token, backendUrl, source)
      .then(() => {
        chrome.runtime.sendMessage({ type: 'SCRAPING_FINISHED' });
      })
      .catch((error) => {
        chrome.runtime.sendMessage({ 
          type: 'SCRAPING_ERROR', 
          payload: { error: error.message || 'Error al enviar leads al servidor' } 
        });
      });
      
    // Return true to indicate we will send a response asynchronously
    return true;
  }
});

async function submitLeads(
  campaign_id: string,
  leads: any[],
  token: string,
  backendUrl: string,
  source?: string
) {
  console.log(`[EficacIA Background] Submitting ${leads.length} leads (source: ${source ?? 'extension'}) to ${backendUrl}...`);
  
  const response = await fetch(`${backendUrl}/api/linkedin/bulk-import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      type: 'extension',
      campaign_id,
      leads,
      ...(source ? { source } : {}),
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Error del servidor: ${response.status}`);
  }

  console.log("[EficacIA Background] Bulk import successful!");
}
