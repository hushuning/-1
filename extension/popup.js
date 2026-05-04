'use strict';

const input = document.getElementById('serverUrl');
const statusEl = document.getElementById('status');
const DEFAULT_SERVER_URL = 'http://127.0.0.1:8765';

chrome.storage.sync.get(['serverUrl'], ({ serverUrl }) => {
  input.value = serverUrl || DEFAULT_SERVER_URL;
});

function show(value) {
  statusEl.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

async function callBackground(type) {
  return new Promise((resolve) => chrome.runtime.sendMessage({ type }, resolve));
}

document.getElementById('save').addEventListener('click', () => {
  chrome.storage.sync.set({ serverUrl: input.value.trim() || DEFAULT_SERVER_URL }, () => show('Saved.'));
});

document.getElementById('health').addEventListener('click', async () => {
  show(await callBackground('WAAB_HEALTH'));
});

document.getElementById('tools').addEventListener('click', async () => {
  show(await callBackground('WAAB_TOOLS'));
});
