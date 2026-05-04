# GitHub automation workflow

WAAB v0.4 adds a safer API-based GitHub workflow. It does **not** click GitHub OAuth or permission prompts in the browser. GitHub write operations should use a local token or GitHub App permissions through the local server.

## New tools

Local Git tools:

- `git.add`
- `git.commit`
- `git.push`

GitHub API tools:

- `github.listIssues`
- `github.createIssue`
- `github.commentIssue`
- `github.createPR`

## Recommended coding autopilot

Start with local code changes and tests, but keep push and PR manual until stable:

```bash
WAAB_WORKSPACE=/path/to/project \
WAAB_AUTOPILOT=1 \
WAAB_ENABLE_WRITE=1 \
WAAB_ENABLE_GIT_WRITE=1 \
WAAB_ENABLE_SHELL=1 \
WAAB_AUTO_TOOLS="file.read,file.write,file.append,git.status,git.diff,git.createBranch,git.add,git.commit,test.run,memory.write,memory.read" \
WAAB_ALLOWED_TEST_COMMANDS="npm test,npm run lint,pytest" \
node server/server.js
```

## Full PR autopilot

Only use this in a trusted repository with a fine-grained token:

```bash
WAAB_WORKSPACE=/path/to/project \
WAAB_AUTOPILOT=1 \
WAAB_ENABLE_WRITE=1 \
WAAB_ENABLE_GIT_WRITE=1 \
WAAB_ENABLE_GIT_PUSH=1 \
WAAB_ENABLE_SHELL=1 \
WAAB_ENABLE_GITHUB_WRITE=1 \
GITHUB_TOKEN=github_pat_xxx \
WAAB_AUTO_TOOLS="file.read,file.write,file.append,git.status,git.diff,git.createBranch,git.add,git.commit,git.push,test.run,github.listIssues,github.commentIssue,github.createPR,memory.write,memory.read" \
WAAB_ALLOWED_TEST_COMMANDS="npm test,npm run lint,pytest" \
node server/server.js
```

## Agent-call sequence

Ask the web AI to use this sequence:

````markdown
```agent-call
{"tool":"git.status","args":{}}
```
````

Create a task branch:

````markdown
```agent-call
{"tool":"git.createBranch","args":{"branch":"waab/task-name"}}
```
````

Read and edit files:

````markdown
```agent-call
{"tool":"file.read","args":{"path":"README.md"}}
```
````

````markdown
```agent-call
{"tool":"file.write","args":{"path":"README.md","content":"..."}}
```
````

Run tests:

````markdown
```agent-call
{"tool":"test.run","args":{"command":"npm test"}}
```
````

Inspect diff:

````markdown
```agent-call
{"tool":"git.diff","args":{}}
```
````

Commit:

````markdown
```agent-call
[
  {"tool":"git.add","args":{"files":["README.md"]}},
  {"tool":"git.commit","args":{"message":"docs: update README"}}
]
```
````

Push branch:

````markdown
```agent-call
{"tool":"git.push","args":{"branch":"waab/task-name"}}
```
````

Create PR:

````markdown
```agent-call
{"tool":"github.createPR","args":{"repo":"OWNER/REPO","head":"waab/task-name","base":"main","title":"docs: update README","body":"Summary\n- Updated README\n\nTests\n- npm test"}}
```
````

## Safety notes

- Do not enable `WAAB_ENABLE_GIT_PUSH` until local write/test/commit loop is reliable.
- Use a fine-grained GitHub token limited to one repository.
- Do not include deployment commands in `WAAB_ALLOWED_TEST_COMMANDS`.
- Keep secrets out of `WAAB_WORKSPACE`.
- Keep browser extension Auto-approve enabled only when server allowlists are strict.
