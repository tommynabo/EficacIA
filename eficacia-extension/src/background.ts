// EficacIA Background Service Worker

chrome.runtime.onInstalled.addListener(() => {
  console.log('EficacIA Extension Installed');
});

// Listener for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SUBMIT_LEADS') {
    const { campaign_id, leads, token, backendUrl } = message.payload;
    
    submitLeads(campaign_id, leads, token, backendUrl)
      .then(() => {
        chrome.runtime.sendMessage({ type: 'SCRAPING_FINISHED' });
      })
      .catch((error) => {
        chrome.runtime.sendMessage({ 
          type: 'SCRAPING_ERROR', 
          payload: { error: error.message || 'Error al enviar leads al servidor' } 
        });
      });
      
    // Return true to indicate we will send a response asynchronously (though we use runtime.sendMessage)
    return true;
  }
  
  if (message.type === 'PING') {
    sendResponse({ type: 'PONG' });
  }
});

async function submitLeads(campaign_id: string, leads: any[], token: string, backendUrl: string) {
  console.log(`[EficacIA Background] Sending ${leads.length} leads to ${backendUrl}...`);
  
  const response = await fetch(`${backendUrl}/api/linkedin/bulk-import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      importType: 'extension',
      campaign_id,
      leads
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Error del servidor: ${response.status}`);
  }

  console.log("[EficacIA Background] Bulk import successful!");
}
