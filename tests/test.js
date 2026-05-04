'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { makeConfig, dispatchToolCall } = require('../server/server');

async function expectReject(fn, pattern) {
  let rejected = false;
  try {
    await fn();
  } catch (error) {
    rejected = true;
    assert.match(String(error.message || error), pattern);
  }
  assert.equal(rejected, true, 'Expected rejection.');
}

async function main() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'waab-test-'));
  const skillsDir = path.join(workspace, 'skills');
  const skillDir = path.join(skillsDir, 'hci-humanizer');
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# hci-humanizer\n\nRewrite text to sound less generic.\n', 'utf8');

  const readonly = makeConfig({ WAAB_WORKSPACE: workspace, WAAB_SKILL_PATHS: skillsDir });

  const echo = await dispatchToolCall({ tool: 'safe.echo', args: { ok: true } }, readonly);
  assert.deepEqual(echo, { echo: { ok: true } });

  await expectReject(
    () => dispatchToolCall({ tool: 'file.write', args: { path: 'x.txt', content: 'x' } }, readonly),
    /WAAB_ENABLE_WRITE/
  );

  await expectReject(
    () => dispatchToolCall({ tool: 'file.read', args: { path: '../escape.txt' } }, readonly),
    /escapes WAAB_WORKSPACE/
  );

  const skills = await dispatchToolCall({ tool: 'skills.list', args: {} }, readonly);
  assert.equal(skills.skills[0].name, 'hci-humanizer');

  const applied = await dispatchToolCall({ tool: 'skills.apply', args: { skill: 'hci-humanizer', input: 'Great question! This is pivotal.' } }, readonly);
  assert.match(applied.prompt, /hci-humanizer/);
  assert.match(applied.prompt, /Great question/);

  const writeEnabled = makeConfig({ WAAB_WORKSPACE: workspace, WAAB_SKILL_PATHS: skillsDir, WAAB_ENABLE_WRITE: '1' });
  await dispatchToolCall({ tool: 'file.write', args: { path: 'x.txt', content: 'hello' } }, writeEnabled);
  assert.equal(fs.readFileSync(path.join(workspace, 'x.txt'), 'utf8'), 'hello');

  const autopilot = makeConfig({
    WAAB_WORKSPACE: workspace,
    WAAB_SKILL_PATHS: skillsDir,
    WAAB_AUTOPILOT: '1',
    WAAB_ENABLE_WRITE: '1',
    WAAB_AUTO_TOOLS: 'memory.write'
  });

  await expectReject(
    () => dispatchToolCall({ tool: 'file.write', args: { path: 'blocked.txt', content: 'x' } }, autopilot),
    /not in WAAB_AUTO_TOOLS/
  );

  await dispatchToolCall({ tool: 'memory.write', args: { content: 'learned rule' } }, autopilot);
  const memory = await dispatchToolCall({ tool: 'memory.read', args: {} }, autopilot);
  assert.equal(memory.memories.length, 1);
  assert.match(memory.memories[0].content, /learned rule/);

  console.log('All tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
