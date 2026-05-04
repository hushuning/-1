(() => {
  'use strict';

  const PROCESSED_ATTR = 'data-waab-processed';
  const DANGEROUS_TOOLS = new Set([
    'file.write', 'file.append', 'git.syncMain', 'git.createBranch', 'github.createIssue',
    'shell.run', 'test.run', 'memory.write', 'mcp.tool.call'
  ]);

  function getSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['autoApproveHighRisk'], (items) => {
        resolve({ autoApproveHighRisk: items.autoApproveHighRisk === true });
      });
    });
  }

  function parseAgentCalls(text) {
    const calls = [];
    const blockRe = /```agent-call\s*([\s\S]*?)```/g;
    let match;
    while ((match = blockRe.exec(text))) {
      const raw = match[1].trim();
      try {
        const parsed = JSON.parse(raw);
        const batch = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of batch) {
          if (item && typeof item.tool === 'string') calls.push(item);
        }
      } catch (error) {
        calls.push({ tool: 'parse.error', args: { raw, error: String(error.message || error) } });
      }
    }
    return calls;
  }

  function findAssistantNodes() {
    const selectors = [
      '[data-message-author-role="assistant"]',
      '.markdown',
      'article',
      '[data-testid*="conversation-turn"]',
      '[class*="assistant"]'
    ];
    const nodes = new Set();
    for (const selector of selectors) {
      document.querySelectorAll(selector).forEach((node) => {
        if (node && node.textContent && node.textContent.includes('```agent-call')) nodes.add(node);
      });
    }
    return [...nodes];
  }

  function findInputElement() {
    const selectors = ['textarea', '[contenteditable="true"]', 'div[role="textbox"]'];
    for (const selector of selectors) {
      const els = [...document.querySelectorAll(selector)].filter((el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 100 && rect.height > 10 && style.visibility !== 'hidden' && style.display !== 'none' && !el.disabled;
      });
      if (els.length) return els[els.length - 1];
    }
    return null;
  }

  function setInputText(text) {
    const input = findInputElement();
    if (!input) {
      alert('WAAB: could not find web AI input box.');
      return;
    }
    input.focus();
    if (input.tagName === 'TEXTAREA') {
      input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    input.textContent = text;
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  }

  function formatResult(call, response) {
    return [
      '```agent-result',
      JSON.stringify({ call, response }, null, 2),
      '```',
      '',
      '请根据上面的工具结果继续。'
    ].join('\n');
  }

  async function sendMessage(type, payload) {
    return new Promise((resolve) => chrome.runtime.sendMessage({ type, payload }, resolve));
  }

  async function executeCall(call) {
    const settings = await getSettings();
    if (DANGEROUS_TOOLS.has(call.tool) && !settings.autoApproveHighRisk) {
      const ok = confirm(`WAAB wants to run high-risk tool: ${call.tool}\n\nAllow once?\n\nTo skip this dialog, enable Auto-approve in the extension popup. The local server policy will still enforce WAAB_AUTO_TOOLS and environment flags.`);
      if (!ok) return { ok: false, error: 'User rejected high-risk tool call.' };
    }
    return sendMessage('WAAB_TOOL_CALL', call);
  }

  async function processNode(node) {
    if (node.getAttribute(PROCESSED_ATTR) === '1') return;
    const calls = parseAgentCalls(node.textContent || '');
    if (!calls.length) return;
    node.setAttribute(PROCESSED_ATTR, '1');

    const results = [];
    for (const call of calls) {
      const response = await executeCall(call);
      results.push(formatResult(call, response));
    }
    setInputText(results.join('\n\n'));
  }

  function scan() {
    for (const node of findAssistantNodes()) processNode(node).catch((err) => console.error('WAAB scan error', err));
  }

  const observer = new MutationObserver(() => scan());
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  scan();
})();
