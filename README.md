# Web AI Agent Bridge v0.4

一个“网页版 AI → 本地 Agent Server → Skill / Git / GitHub / 测试工具”的浏览器桥接器 MVP。

它让 ChatGPT / Claude / Gemini 网页版通过固定的 `agent-call` 代码块调用本地工具。插件会把工具结果回填到网页输入框；是否跳过插件确认由 popup 的 Auto-approve 开关控制，真正执行权限由本地 server 的白名单控制。

## 架构

```text
ChatGPT / Claude / Gemini Web
        ↓ content script 监听 agent-call
Chrome / Edge Extension
        ↓ HTTP localhost
Agent Server
        ↓ tool router + policy gate
Skills / Git / GitHub / file / test / memory / MCP config discovery
```

## 当前能力

基础工具：

- `tools.list`
- `policy.get`
- `safe.echo`
- `time.now`

文件 / workspace：

- `workspace.tree`
- `file.read`
- `file.write`
- `file.append`

Git 本地工作流：

- `git.status`
- `git.diff`
- `git.createBranch`
- `git.add`
- `git.commit`
- `git.push`

测试：

- `test.run`

GitHub API：

- `github.repoInfo`
- `github.listIssues`
- `github.createIssue`
- `github.commentIssue`
- `github.createPR`

Skills：

- `skills.list`
- `skills.read`
- `skills.apply`
- `skills.installFromGitHub`

记忆 / MCP 发现：

- `memory.write`
- `memory.read`
- `mcp.servers`

## 安装

仓库名以 `-` 开头，在 zsh/bash 里进入目录时要写 `./-1`，不能写 `cd -1`。

```bash
git clone https://github.com/hushuning/-1.git
cd ./-1
npm test
```

或者 clone 时直接改成本地目录名：

```bash
git clone https://github.com/hushuning/-1.git web-ai-agent-bridge
cd web-ai-agent-bridge
npm test
```

启动只读模式：

```bash
node server/server.js
```

加载插件：

1. 打开 `chrome://extensions`。
2. 打开开发者模式。
3. 点击“加载已解压的扩展程序”。
4. 选择 `extension/` 目录。
5. 打开插件 popup，确认 server URL 是 `http://127.0.0.1:8765`。

## 自动驾驶模式

只自动读 skill / 文件 / 状态：

```bash
WAAB_WORKSPACE=/path/to/project \
WAAB_AUTOPILOT=1 \
WAAB_AUTO_TOOLS="skills.list,skills.read,skills.apply,file.read,git.status,git.diff,memory.read" \
node server/server.js
```

自动本地编码、测试、提交，但不 push / 不建 PR：

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

完整 PR 自动化，需谨慎，只建议 fine-grained token + 单仓库权限：

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

## 使用

在 ChatGPT / Claude / Gemini 网页中让 AI 输出：

````markdown
```agent-call
{
  "tool": "policy.get",
  "args": {}
}
```
````

测试工具列表：

````markdown
```agent-call
{
  "tool": "tools.list",
  "args": {}
}
```
````

使用本地 skill：

````markdown
```agent-call
{
  "tool": "skills.apply",
  "args": {
    "skill": "hci-humanizer",
    "input": "Great question! This marks a pivotal moment..."
  }
}
```
````

创建 PR：

````markdown
```agent-call
{
  "tool": "github.createPR",
  "args": {
    "repo": "OWNER/REPO",
    "head": "waab/task-name",
    "base": "main",
    "title": "docs: update README",
    "body": "Summary\n- Updated README\n\nTests\n- npm test"
  }
}
```
````

## 热更新

见 [`docs/HOT_UPDATE.md`](docs/HOT_UPDATE.md)。

## CCSwitch skills

见 [`docs/CCSWITCH_SKILL_PLAN.md`](docs/CCSWITCH_SKILL_PLAN.md)。

默认读取：

```text
~/.claude/skills
~/.config/opencode/skills
```

初始推荐 skill：`sarkrui/CCSwitchSkills` 的 `hci-humanizer`。

## GitHub 自动化

见 [`docs/GITHUB_AUTOMATION.md`](docs/GITHUB_AUTOMATION.md)。

WAAB 不自动点击 GitHub OAuth / 权限授权按钮。GitHub 写操作走本地 server 的 token / GitHub App / gh CLI 权限模型。

## 安全设计

- 插件不会自动点击发送。
- 插件可开启 Auto-approve，但 server 仍会按白名单拒绝未授权工具。
- server 默认只读。
- 文件访问限制在 `WAAB_WORKSPACE` 内。
- Shell / Git 写操作 / Git push / GitHub 写操作默认关闭。
- 测试命令必须在 allowlist 内。
- 不做 GitHub 授权页自动点击。

## License

MIT
