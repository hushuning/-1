'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

const PORT = Number(process.env.WAAB_PORT || 8765);
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_TEXT_BYTES = 256 * 1024;

function splitList(value) {
  return String(value || '').split(',').map((x) => x.trim()).filter(Boolean);
}

function expandHome(p) {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

function makeConfig(env = process.env) {
  const workspace = path.resolve(expandHome(env.WAAB_WORKSPACE || process.cwd()));
  const skillPaths = splitList(env.WAAB_SKILL_PATHS).map(expandHome);
  if (!skillPaths.length) {
    skillPaths.push(path.join(os.homedir(), '.claude', 'skills'));
    skillPaths.push(path.join(os.homedir(), '.config', 'opencode', 'skills'));
  }
  return {
    workspace,
    port: Number(env.WAAB_PORT || PORT),
    autopilot: String(env.WAAB_AUTOPILOT || '').trim() === '1',
    autoTools: new Set(splitList(env.WAAB_AUTO_TOOLS)),
    enableWrite: String(env.WAAB_ENABLE_WRITE || '').trim() === '1',
    enableGitWrite: String(env.WAAB_ENABLE_GIT_WRITE || '').trim() === '1',
    enableGitPush: String(env.WAAB_ENABLE_GIT_PUSH || '').trim() === '1',
    enableShell: String(env.WAAB_ENABLE_SHELL || '').trim() === '1',
    enableGithubWrite: String(env.WAAB_ENABLE_GITHUB_WRITE || '').trim() === '1',
    allowedTestCommands: new Set(splitList(env.WAAB_ALLOWED_TEST_COMMANDS || 'npm test,npm run lint,pytest')),
    githubToken: env.GITHUB_TOKEN || env.GH_TOKEN || '',
    skillPaths: skillPaths.map((p) => path.resolve(p))
  };
}

const TOOL_META = {
  'safe.echo': { risk: 'read', description: 'Echo input for protocol testing.' },
  'time.now': { risk: 'read', description: 'Return server time.' },
  'tools.list': { risk: 'read', description: 'List available WAAB tools.' },
  'policy.get': { risk: 'read', description: 'Return active safety policy.' },
  'workspace.tree': { risk: 'read', description: 'List files under WAAB_WORKSPACE.' },
  'file.read': { risk: 'read', description: 'Read UTF-8 file inside WAAB_WORKSPACE.' },
  'file.write': { risk: 'write', description: 'Write UTF-8 file inside WAAB_WORKSPACE.' },
  'file.append': { risk: 'write', description: 'Append UTF-8 file inside WAAB_WORKSPACE.' },
  'git.status': { risk: 'read', description: 'Run git status --short --branch.' },
  'git.diff': { risk: 'read', description: 'Run git diff.' },
  'git.createBranch': { risk: 'git-write', description: 'Create or reset a task branch.' },
  'git.add': { risk: 'git-write', description: 'Stage files.' },
  'git.commit': { risk: 'git-write', description: 'Create a local commit.' },
  'git.push': { risk: 'git-push', description: 'Push current or specified branch.' },
  'test.run': { risk: 'shell', description: 'Run an allowlisted test command.' },
  'github.repoInfo': { risk: 'read', description: 'Return GitHub repo metadata.' },
  'github.listIssues': { risk: 'read', description: 'List GitHub issues.' },
  'github.createIssue': { risk: 'github-write', description: 'Create a GitHub issue.' },
  'github.commentIssue': { risk: 'github-write', description: 'Comment on a GitHub issue or PR.' },
  'github.createPR': { risk: 'github-write', description: 'Create a GitHub pull request.' },
  'memory.write': { risk: 'write', description: 'Append a local task memory note.' },
  'memory.read': { risk: 'read', description: 'Read local task memory notes.' },
  'mcp.servers': { risk: 'read', description: 'Discover common MCP config server names.' },
  'skills.list': { risk: 'read', description: 'List local CCSwitch/Claude/OpenCode style skills.' },
  'skills.read': { risk: 'read', description: 'Read SKILL.md for a local skill.' },
  'skills.apply': { risk: 'read', description: 'Wrap a local skill and input into a prompt for the web AI.' },
  'skills.installFromGitHub': { risk: 'read', description: 'Generate install commands for a GitHub-hosted skill.' }
};

const AUTOPILOT_RISKS = new Set(['write', 'git-write', 'git-push', 'shell', 'github-write']);

function fail(message, statusCode = 403) {
  const err = new Error(message);
  err.statusCode = statusCode;
  throw err;
}

function policySummary(config) {
  return {
    workspace: config.workspace,
    autopilot: config.autopilot,
    autoTools: [...config.autoTools],
    enableWrite: config.enableWrite,
    enableGitWrite: config.enableGitWrite,
    enableGitPush: config.enableGitPush,
    enableShell: config.enableShell,
    enableGithubWrite: config.enableGithubWrite,
    allowedTestCommands: [...config.allowedTestCommands],
    skillPaths: config.skillPaths,
    githubTokenPresent: Boolean(config.githubToken)
  };
}

function assertPolicy(tool, config) {
  const meta = TOOL_META[tool];
  if (!meta) fail(`Unknown tool: ${tool}`, 404);
  if (config.autopilot && AUTOPILOT_RISKS.has(meta.risk) && !config.autoTools.has(tool)) {
    fail(`Autopilot is enabled, but ${tool} is not in WAAB_AUTO_TOOLS.`);
  }
  if (meta.risk === 'write' && !config.enableWrite) fail(`${tool} requires WAAB_ENABLE_WRITE=1.`);
  if (meta.risk === 'git-write' && !config.enableGitWrite) fail(`${tool} requires WAAB_ENABLE_GIT_WRITE=1.`);
  if (meta.risk === 'git-push') {
    if (!config.enableGitWrite) fail(`${tool} requires WAAB_ENABLE_GIT_WRITE=1.`);
    if (!config.enableGitPush) fail(`${tool} requires WAAB_ENABLE_GIT_PUSH=1.`);
  }
  if (meta.risk === 'shell' && !config.enableShell) fail(`${tool} requires WAAB_ENABLE_SHELL=1.`);
  if (meta.risk === 'github-write') {
    if (!config.enableGithubWrite) fail(`${tool} requires WAAB_ENABLE_GITHUB_WRITE=1.`);
    if (!config.githubToken) fail(`${tool} requires GITHUB_TOKEN or GH_TOKEN.`);
  }
}

function safeResolve(config, userPath = '.') {
  const resolved = path.resolve(config.workspace, userPath);
  const rel = path.relative(config.workspace, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) fail(`Path escapes WAAB_WORKSPACE: ${userPath}`);
  return resolved;
}

function readTextFile(filePath) {
  const stat = fs.statSync(filePath);
  if (stat.size > MAX_TEXT_BYTES) fail(`File too large to read: ${stat.size} bytes.`);
  return fs.readFileSync(filePath, 'utf8');
}

function listTree(root, depth = 2, maxEntries = 200) {
  const out = [];
  function walk(dir, currentDepth) {
    if (out.length >= maxEntries || currentDepth > depth) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    entries = entries.filter((e) => !['node_modules', '.git', '.DS_Store'].includes(e.name)).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (out.length >= maxEntries) break;
      const full = path.join(dir, entry.name);
      out.push({ path: path.relative(root, full) || '.', type: entry.isDirectory() ? 'dir' : 'file' });
      if (entry.isDirectory()) walk(full, currentDepth + 1);
    }
  }
  walk(root, 0);
  return out;
}

function runCommand(command, args, cwd, timeoutMs = 120000) {
  return new Promise((resolve) => {
    execFile(command, args, { cwd, timeout: timeoutMs, windowsHide: true }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        code: error && typeof error.code === 'number' ? error.code : 0,
        stdout: String(stdout || '').slice(-60000),
        stderr: String(stderr || '').slice(-60000),
        error: error ? String(error.message || error) : null
      });
    });
  });
}

function parseCommand(commandLine) {
  const trimmed = String(commandLine || '').trim();
  if (!trimmed) fail('Missing command.');
  const parts = trimmed.split(/\s+/);
  return { command: parts[0], args: parts.slice(1), normalized: trimmed };
}

function safeBranchName(branch) {
  const value = String(branch || '').trim();
  if (!/^[a-zA-Z0-9._/-]+$/.test(value)) fail('Invalid branch name.');
  if (value.startsWith('-') || value.includes('..') || value.includes('//')) fail('Unsafe branch name.');
  return value;
}

function safeCommitMessage(message) {
  const value = String(message || '').trim();
  if (!value) fail('Missing commit message.');
  if (value.length > 500) fail('Commit message too long.');
  return value;
}

function normalizeFileList(files) {
  if (!files) return ['.'];
  const list = Array.isArray(files) ? files : [files];
  if (!list.length) return ['.'];
  return list.map((item) => {
    const value = String(item || '').trim();
    if (!value || value.startsWith('-') || path.isAbsolute(value) || value.includes('..')) fail(`Unsafe git path: ${value}`);
    return value;
  });
}

function skillNameIsSafe(name) {
  return typeof name === 'string' && /^[a-zA-Z0-9._-]+$/.test(name);
}

function discoverSkills(config) {
  const skills = [];
  for (const base of config.skillPaths) {
    if (!fs.existsSync(base)) continue;
    let entries = [];
    try { entries = fs.readdirSync(base, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillDir = path.join(base, entry.name);
      const skillMd = path.join(skillDir, 'SKILL.md');
      if (fs.existsSync(skillMd)) skills.push({ name: entry.name, path: skillDir, sourceBase: base, skillMd });
    }
  }
  return skills;
}

function findSkill(config, name) {
  if (!skillNameIsSafe(name)) fail('Invalid skill name.');
  const skill = discoverSkills(config).find((item) => item.name === name);
  if (!skill) fail(`Skill not found: ${name}`, 404);
  return skill;
}

function readSkill(config, name) {
  const skill = findSkill(config, name);
  return { name: skill.name, path: skill.path, content: readTextFile(skill.skillMd) };
}

function readMcpConfigFiles() {
  const files = ['~/.claude.json', '~/.claude/mcp.json', '~/.config/claude/mcp.json', '~/.config/opencode/mcp.json', '~/Library/Application Support/Claude/claude_desktop_config.json'].map(expandHome);
  return files.filter((file) => fs.existsSync(file)).map((file) => {
    try {
      const json = JSON.parse(readTextFile(file));
      const servers = json.mcpServers || json.mcp_servers || json.servers || {};
      return { file, servers: Object.keys(servers) };
    } catch (error) {
      return { file, error: String(error.message || error) };
    }
  });
}

async function githubJson(pathname, options = {}, config) {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'web-ai-agent-bridge', ...(options.headers || {}) };
  if (config.githubToken) headers.Authorization = `Bearer ${config.githubToken}`;
  const res = await fetch(`https://api.github.com${pathname}`, { ...options, headers });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, result: json };
}

function assertRepo(repo) {
  const value = String(repo || '').trim();
  if (!/^[^/\s]+\/[^/\s]+$/.test(value)) fail('repo must be owner/name.');
  return value;
}

function issueNumber(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) fail('issue_number must be a positive integer.');
  return n;
}

async function dispatchToolCall(call, config = makeConfig()) {
  const tool = call && call.tool;
  const args = (call && call.args) || {};
  assertPolicy(tool, config);

  switch (tool) {
    case 'safe.echo': return { echo: args };
    case 'time.now': return { iso: new Date().toISOString(), epochMs: Date.now() };
    case 'tools.list': return Object.entries(TOOL_META).map(([name, meta]) => ({ name, ...meta }));
    case 'policy.get': return policySummary(config);
    case 'workspace.tree': return { root: config.workspace, entries: listTree(safeResolve(config, args.path || '.'), Number(args.depth || 2), Number(args.maxEntries || 200)) };
    case 'file.read': {
      const file = safeResolve(config, args.path);
      return { path: path.relative(config.workspace, file), content: readTextFile(file) };
    }
    case 'file.write': {
      const file = safeResolve(config, args.path);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, String(args.content || ''), 'utf8');
      return { path: path.relative(config.workspace, file), bytes: Buffer.byteLength(String(args.content || ''), 'utf8') };
    }
    case 'file.append': {
      const file = safeResolve(config, args.path);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.appendFileSync(file, String(args.content || ''), 'utf8');
      return { path: path.relative(config.workspace, file), bytes: Buffer.byteLength(String(args.content || ''), 'utf8') };
    }
    case 'git.status': return runCommand('git', ['status', '--short', '--branch'], config.workspace);
    case 'git.diff': return runCommand('git', ['diff'], config.workspace);
    case 'git.createBranch': return runCommand('git', ['checkout', '-B', safeBranchName(args.branch)], config.workspace);
    case 'git.add': return runCommand('git', ['add', '--', ...normalizeFileList(args.files)], config.workspace);
    case 'git.commit': return runCommand('git', ['commit', '-m', safeCommitMessage(args.message)], config.workspace);
    case 'git.push': {
      const remote = String(args.remote || 'origin').trim();
      if (!/^[a-zA-Z0-9._-]+$/.test(remote)) fail('Invalid remote name.');
      const branch = safeBranchName(args.branch);
      return runCommand('git', ['push', '-u', remote, branch], config.workspace, Number(args.timeoutMs || 120000));
    }
    case 'test.run': {
      const parsed = parseCommand(args.command);
      if (!config.allowedTestCommands.has(parsed.normalized)) fail(`Command is not in WAAB_ALLOWED_TEST_COMMANDS: ${parsed.normalized}`);
      return runCommand(parsed.command, parsed.args, config.workspace, Number(args.timeoutMs || 120000));
    }
    case 'github.repoInfo': return githubJson(`/repos/${assertRepo(args.repo)}`, {}, config);
    case 'github.listIssues': {
      const repo = assertRepo(args.repo);
      const state = ['open', 'closed', 'all'].includes(args.state) ? args.state : 'open';
      const perPage = Math.min(Math.max(Number(args.per_page || 10), 1), 50);
      return githubJson(`/repos/${repo}/issues?state=${state}&per_page=${perPage}`, {}, config);
    }
    case 'github.createIssue': {
      const repo = assertRepo(args.repo);
      const body = JSON.stringify({ title: String(args.title || 'WAAB issue'), body: String(args.body || '') });
      return githubJson(`/repos/${repo}/issues`, { method: 'POST', body, headers: { 'Content-Type': 'application/json' } }, config);
    }
    case 'github.commentIssue': {
      const repo = assertRepo(args.repo);
      const number = issueNumber(args.issue_number || args.number);
      const body = JSON.stringify({ body: String(args.body || '') });
      return githubJson(`/repos/${repo}/issues/${number}/comments`, { method: 'POST', body, headers: { 'Content-Type': 'application/json' } }, config);
    }
    case 'github.createPR': {
      const repo = assertRepo(args.repo);
      const payload = {
        title: String(args.title || 'WAAB pull request'),
        body: String(args.body || ''),
        head: safeBranchName(args.head),
        base: safeBranchName(args.base || 'main'),
        draft: Boolean(args.draft)
      };
      return githubJson(`/repos/${repo}/pulls`, { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' } }, config);
    }
    case 'memory.write': {
      const dir = safeResolve(config, '.waab-memory');
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${new Date().toISOString().slice(0, 10)}.md`);
      const text = `\n\n## ${new Date().toISOString()}\n\n${String(args.content || '')}\n`;
      fs.appendFileSync(file, text, 'utf8');
      return { path: path.relative(config.workspace, file), bytes: Buffer.byteLength(text, 'utf8') };
    }
    case 'memory.read': {
      const dir = safeResolve(config, '.waab-memory');
      if (!fs.existsSync(dir)) return { memories: [] };
      const files = fs.readdirSync(dir).filter((name) => name.endsWith('.md')).sort().slice(-Number(args.limit || 5));
      return { memories: files.map((name) => ({ name, content: readTextFile(path.join(dir, name)) })) };
    }
    case 'mcp.servers': return { configs: readMcpConfigFiles() };
    case 'skills.list': return { skillPaths: config.skillPaths, skills: discoverSkills(config).map((s) => ({ name: s.name, path: s.path, sourceBase: s.sourceBase })) };
    case 'skills.read': return readSkill(config, args.skill);
    case 'skills.apply': {
      const skill = readSkill(config, args.skill);
      const prompt = [`你正在使用本地 skill：${skill.name}`, '', '请严格按照下面 SKILL.md 的规则处理用户输入。', '', '--- SKILL.md ---', skill.content, '--- END SKILL.md ---', '', '--- USER INPUT ---', String(args.input || ''), '--- END USER INPUT ---', '', '请直接输出处理结果，不要解释工具调用过程。'].join('\n');
      return { skill: skill.name, prompt };
    }
    case 'skills.installFromGitHub': {
      const repo = assertRepo(args.repo || 'sarkrui/CCSwitchSkills');
      const skill = String(args.skill || 'hci-humanizer').trim();
      if (!skillNameIsSafe(skill)) fail('Invalid skill name.');
      return { repo, skill, note: 'Commands only; WAAB does not execute install automatically.', commands: [`git clone https://github.com/${repo}.git`, 'mkdir -p ~/.claude/skills', `cp -r ${path.basename(repo)}/${skill} ~/.claude/skills/`] };
    }
    default: fail(`Unhandled tool: ${tool}`, 404);
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' });
  res.end(JSON.stringify(payload, null, 2));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) reject(new Error('Request body too large.'));
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function createServer(config = makeConfig()) {
  return http.createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') return sendJson(res, 200, { ok: true });
      const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
      if (req.method === 'GET' && url.pathname === '/health') return sendJson(res, 200, { ok: true, service: 'waab', version: '0.4.0', policy: policySummary(config) });
      if (req.method === 'GET' && url.pathname === '/tools') return sendJson(res, 200, { ok: true, tools: await dispatchToolCall({ tool: 'tools.list', args: {} }, config) });
      if (req.method === 'POST' && url.pathname === '/tool/call') {
        const call = JSON.parse(await readBody(req) || '{}');
        return sendJson(res, 200, { ok: true, result: await dispatchToolCall(call, config) });
      }
      return sendJson(res, 404, { ok: false, error: 'Not found.' });
    } catch (error) {
      return sendJson(res, error.statusCode || 500, { ok: false, error: String(error.message || error) });
    }
  });
}

if (require.main === module) {
  const config = makeConfig();
  createServer(config).listen(config.port, '127.0.0.1', () => {
    console.log(`Web AI Agent Bridge server listening on http://127.0.0.1:${config.port}`);
    console.log(JSON.stringify(policySummary(config), null, 2));
  });
}

module.exports = { makeConfig, createServer, dispatchToolCall, policySummary, TOOL_META };
