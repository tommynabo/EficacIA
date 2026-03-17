// EficacIA Background Service Worker

chrome.runtime.onInstalled.addListener(() => {
  console.log('EficacIA Extension Installed');
});

// Listener for messages that might need to be handled in the background
// (e.g., long-running tasks or cross-context communication)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PING') {
    sendResponse({ type: 'PONG' });
  }
});
