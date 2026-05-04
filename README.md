# Web AI Agent Bridge v0.2

一个“网页版 AI → 本地 Agent Server → MCP/Git/GitHub/测试工具”的浏览器桥接器 MVP。

它让 ChatGPT / Claude / Gemini 网页版通过固定的 `agent-call` 代码块调用本地工具。插件会把工具结果回填到网页输入框，但不会自动点击发送，避免工具递归执行失控。

## 架构

```text
ChatGPT / Claude / Gemini Web
        ↓ content script 监听 agent-call
Chrome / Edge Extension
        ↓ HTTP localhost
Agent Server
        ↓ tool router + policy gate
Git / GitHub / file / test / memory / MCP config discovery
```

## v0.2 新增

- `tools.list`：列出工具能力。
- `policy.get`：查看本地 server 安全策略和环境开关。
- `workspace.tree`：查看 workspace 文件树。
- `file.read`：读取 workspace 内 UTF-8 文件。
- `file.write` / `file.append`：写文件，默认关闭，需要 `WAAB_ENABLE_WRITE=1`。
- `git.status` / `git.diff`：读取 Git 状态和 diff。
- `git.syncMain` / `git.createBranch`：Git 写操作，默认关闭，需要 `WAAB_ENABLE_GIT_WRITE=1`。
- `test.run`：运行 allowlist 内测试命令，默认关闭，需要 `WAAB_ENABLE_SHELL=1`。
- `github.createIssue`：创建 GitHub issue，默认关闭，需要 `WAAB_ENABLE_GITHUB_WRITE=1` 和 `GITHUB_TOKEN`。
- `memory.write` / `memory.read`：写入和读取项目经验记忆。
- `mcp.servers`：读取常见 Claude / MCP 配置文件中的 server 名称。

## 安装

### 1. 启动本地 server

```bash
npm install
npm start
```

默认只读、安全模式：

```bash
node server/server.js
```

开发模式：

```bash
WAAB_ENABLE_SHELL=1 \
WAAB_ENABLE_WRITE=1 \
WAAB_ENABLE_GIT_WRITE=1 \
WAAB_WORKSPACE=/path/to/your/project \
node server/server.js
```

GitHub 写入：

```bash
WAAB_ENABLE_GITHUB_WRITE=1 \
GITHUB_TOKEN=ghp_xxx \
node server/server.js
```

### 2. 加载浏览器插件

1. 打开 `chrome://extensions`。
2. 打开开发者模式。
3. 点击“加载已解压的扩展程序”。
4. 选择 `extension/` 目录。

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

插件会调用本地 server，并把工具结果填入网页输入框。

再测试工具列表：

````markdown
```agent-call
{
  "tool": "tools.list",
  "args": {}
}
```
````

## 安全设计

- 插件不会自动点击发送。
- 高风险工具会在浏览器内弹窗确认。
- server 默认只读。
- 文件访问限制在 `WAAB_WORKSPACE` 内。
- Shell / Git 写操作 / GitHub 写操作默认关闭。
- 测试命令必须在 allowlist 内。

## 热更新

见 [`docs/HOT_UPDATE.md`](docs/HOT_UPDATE.md)。

## 下一步

v0.3 计划优先接 CCSwitch skill：

- `skills.list`
- `skills.read`
- `skills.apply`
- `skills.installFromGitHub`

初始目标技能：`sarkrui/CCSwitchSkills` 里的 `hci-humanizer`。

见 [`docs/CCSWITCH_SKILL_PLAN.md`](docs/CCSWITCH_SKILL_PLAN.md)。

## License

MIT
