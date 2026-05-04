# Autopilot mode

WAAB intentionally asks for confirmation before high-risk actions. A web AI page can be prompt-injected, and its text output should not automatically gain access to your filesystem, shell, GitHub token, browser session, or deployment keys.

Autopilot mode is therefore allowlist-based.

## Recommended safe autopilot

Use a disposable repository or sandbox workspace:

```bash
WAAB_WORKSPACE=/tmp/waab-sandbox \
WAAB_AUTOPILOT=1 \
WAAB_ENABLE_WRITE=1 \
WAAB_ENABLE_SHELL=1 \
WAAB_AUTO_TOOLS="skills.list,skills.read,skills.apply,file.read,file.write,file.append,test.run,memory.write,memory.read" \
WAAB_ALLOWED_TEST_COMMANDS="npm test,npm run lint,pytest" \
node server/server.js
```

This still does **not** enable GitHub writes or Git push by default.

## Coding autopilot

For a local coding loop:

```bash
WAAB_WORKSPACE=/path/to/project \
WAAB_AUTOPILOT=1 \
WAAB_ENABLE_WRITE=1 \
WAAB_ENABLE_GIT_WRITE=1 \
WAAB_ENABLE_SHELL=1 \
WAAB_AUTO_TOOLS="file.read,file.write,file.append,git.status,git.diff,git.createBranch,test.run,memory.write,memory.read" \
WAAB_ALLOWED_TEST_COMMANDS="npm test,npm run lint,pytest" \
node server/server.js
```

Still recommended:

- Work on a new branch.
- Keep production secrets out of the workspace.
- Do not add deploy commands to `WAAB_ALLOWED_TEST_COMMANDS`.
- Do not enable GitHub writes until the workflow is stable.

## GitHub autopilot

GitHub write operations should stay manual until you trust the workflow.

When enabled:

```bash
WAAB_ENABLE_GITHUB_WRITE=1 \
GITHUB_TOKEN=ghp_xxx \
WAAB_AUTO_TOOLS="github.createIssue" \
node server/server.js
```

Do not expose a token with broad organization permissions. Prefer a fine-grained token or GitHub App with only the required repository permissions.

## Browser extension auto-approval

The extension can also auto-approve high-risk tool calls. This only skips the browser confirmation dialog. The server policy still decides what is actually allowed.

Use the popup toggle only with a sandbox workspace.
