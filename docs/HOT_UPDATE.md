# Hot update / development workflow

This project is a Chrome/Edge Manifest V3 extension plus a local Node.js agent server.

## Extension hot reload

Chrome extensions cannot truly hot-update unpacked extension code while content scripts are already injected into pages. Use this loop:

1. Edit files under `extension/`.
2. Open `chrome://extensions`.
3. Click the reload button on **Web AI Agent Bridge**.
4. Refresh the ChatGPT / Claude / Gemini tab.

For faster testing, keep the local server running and only reload the extension when `extension/*` changes.

## Server hot reload

Use Node watch mode:

```bash
npm run dev
```

or manually:

```bash
node --watch server/server.js
```

## Release update

For an unpacked extension:

```bash
git pull
npm test
```

Then reload the extension from `chrome://extensions`.

For a packaged release, zip the `extension/` directory and upload it as a GitHub release artifact.

## Safety defaults

The server starts in read-only mode. Write operations require explicit environment flags:

```bash
WAAB_ENABLE_WRITE=1
WAAB_ENABLE_GIT_WRITE=1
WAAB_ENABLE_SHELL=1
WAAB_ENABLE_GITHUB_WRITE=1
```

Do not enable all flags unless you are testing in a disposable repository.
