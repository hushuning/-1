'use strict';

const input = document.getElementById('serverUrl');
const autoApproveInput = document.getElementById('autoApproveHighRisk');
const statusEl = document.getElementById('status');
const DEFAULT_SERVER_URL = 'http://127.0.0.1:8765';

chrome.storage.sync.get(['serverUrl', 'autoApproveHighRisk'], ({ serverUrl, autoApproveHighRisk }) => {
  input.value = serverUrl || DEFAULT_SERVER_URL;
  autoApproveInput.checked = autoApproveHighRisk === true;
});

function show(value) {
  statusEl.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

async function callBackground(type) {
  return new Promise((resolve) => chrome.runtime.sendMessage({ type }, resolve));
}

document.getElementById('save').addEventListener('click', () => {
  chrome.storage.sync.set({
    serverUrl: input.value.trim() || DEFAULT_SERVER_URL,
    autoApproveHighRisk: autoApproveInput.checked
  }, () => show({ saved: true, autoApproveHighRisk: autoApproveInput.checked }));
});

document.getElementById('health').addEventListener('click', async () => {
  show(await callBackground('WAAB_HEALTH'));
});

document.getElementById('tools').addEventListener('click', async () => {
  show(await callBackground('WAAB_TOOLS'));
});
