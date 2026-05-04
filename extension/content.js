(() => {
  'use strict';

  const PROCESSED_ATTR = 'data-waab-processed';
  const AUTOCLICK_ATTR = 'data-waab-autoclicked';
  const DANGEROUS_TOOLS = new Set([
    'file.write', 'file.append', 'git.syncMain', 'git.createBranch', 'github.createIssue',
    'shell.run', 'test.run', 'memory.write', 'mcp.tool.call'
  ]);

  const SAFE_CONFIRM_RE = /^(confirm|continue|allow|approve|ok|yes|save changes|update branch|merge pull request|create pull request)$/i;
  const AUTH_CONFIRM_RE = /^(authorize|authorize .+|grant access|install|install & authorize|request access|approve access)$/i;
  const DANGER_TEXT_RE = /(delete|remove|revoke|transfer|disable|suspend|deactivate|unlink|disconnect|sign out|reset|permanently|payment|purchase|checkout|deploy|publish|secret|token|ssh key|close account|archive repository)/i;
  const GITHUB_TEXT_RE = /(github|repository|pull request|branch|commit|issue|codespace|oauth|permission|access)/i;

  function getSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get([
        'autoApproveHighRisk',
        'autoClickGithubConfirmations',
        'autoClickGithubAuthorization'
      ], (items) => {
        resolve({
          autoApproveHighRisk: items.autoApproveHighRisk === true,
          autoClickGithubConfirmations: items.autoClickGithubConfirmations === true,
          autoClickGithubAuthorization: items.autoClickGithubAuthorization === true
        });
      });
    });
  }

  function isVisible(el) {
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && style.pointerEvents !== 'none';
  }

  function buttonText(el) {
    return String(el.innerText || el.value || el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function closestContextText(el) {
    const ctx = el.closest('[role="dialog"], dialog, form, main, .Box, .Overlay, .modal, .flash, .Popover, body');
    return String(ctx ? ctx.innerText || ctx.textContent || '' : document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 3000);
  }

  function shouldAutoClickButton(el, settings) {
    const text = buttonText(el);
    if (!text || text.length > 80) return { ok: false };

    const context = closestContextText(el);
    const combined = `${text}\n${context}`;
    const isGithubPage = location.hostname === 'github.com' || location.hostname.endsWith('.github.com');
    const mentionsGithub = GITHUB_TEXT_RE.test(combined);

    if (!isGithubPage && !mentionsGithub) return { ok: false };
    if (DANGER_TEXT_RE.test(combined)) return { ok: false, reason: 'danger text detected' };

    if (SAFE_CONFIRM_RE.test(text)) {
      return { ok: settings.autoClickGithubConfirmations, category: 'safe-confirm', text };
    }

    if (AUTH_CONFIRM_RE.test(text)) {
      return { ok: settings.autoClickGithubAuthorization, category: 'auth-confirm', text };
    }

    return { ok: false };
  }

  async function autoClickGithubConfirmations() {
    const settings = await getSettings();
    if (!settings.autoClickGithubConfirmations && !settings.autoClickGithubAuthorization) return;

    const candidates = [
      ...document.querySelectorAll('button, input[type="submit"], input[type="button"], a[role="button"], .btn')
    ];

    for (const el of candidates) {
      if (!isVisible(el) || el.getAttribute(AUTOCLICK_ATTR) === '1') continue;
      const decision = shouldAutoClickButton(el, settings);
      if (!decision.ok) continue;
      el.setAttribute(AUTOCLICK_ATTR, '1');
      console.info('[WAAB] auto-clicking GitHub confirmation:', decision.category, decision.text);
      setTimeout(() => {
        try { el.click(); } catch (err) { console.error('[WAAB] auto-click failed', err); }
      }, 250);
      return;
    }
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
    autoClickGithubConfirmations().catch((err) => console.error('[WAAB] auto-click scan error', err));
    for (const node of findAssistantNodes()) processNode(node).catch((err) => console.error('WAAB scan error', err));
  }

  const observer = new MutationObserver(() => scan());
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  setInterval(() => autoClickGithubConfirmations().catch(() => {}), 2000);
  scan();
})();
