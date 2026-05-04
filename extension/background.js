'use strict';

const DEFAULT_SERVER_URL = 'http://127.0.0.1:8765';

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(['serverUrl'], (items) => {
    if (!items.serverUrl) chrome.storage.sync.set({ serverUrl: DEFAULT_SERVER_URL });
  });
});

async function callServer(path, options = {}) {
  const { serverUrl } = await chrome.storage.sync.get(['serverUrl']);
  const baseUrl = (serverUrl || DEFAULT_SERVER_URL).replace(/\/$/, '');
  const res = await fetch(`${baseUrl}${path}`, options);
  const json = await res.json();
  return { ok: res.ok, result: json };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;

  (async () => {
    try {
      if (message.type === 'WAAB_TOOL_CALL') {
        const reply = await callServer('/tool/call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message.payload)
        });
        sendResponse(reply);
        return;
      }

      if (message.type === 'WAAB_HEALTH') {
        sendResponse(await callServer('/health'));
        return;
      }

      if (message.type === 'WAAB_TOOLS') {
        sendResponse(await callServer('/tools'));
        return;
      }

      sendResponse({ ok: false, error: `Unknown message type: ${message.type}` });
    } catch (error) {
      sendResponse({ ok: false, error: String(error && error.message ? error.message : error) });
    }
  })();

  return true;
});
