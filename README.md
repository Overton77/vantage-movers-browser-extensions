# Granot Sync — Browser Extension

TypeScript browser extension for Chrome and Firefox. Runs on Granot CRM pages, logs page context, and can ping the Vantage server.

Built with [WXT](https://wxt.dev/) (Manifest V3, cross-browser).

## Prerequisites

- Node.js 18+
- [pnpm](https://pnpm.io/installation) 9+
- Google Chrome or Mozilla Firefox

## Setup

```bash
cd granot_sync_extensions_and_services
pnpm install
```

Copy `.env.example` to `.env` if you need to override the API base URL.

## Development

**Chrome (default):**

```bash
pnpm dev
```

**Firefox:**

```bash
pnpm dev:firefox
```

WXT watches files and rebuilds automatically. Reload the extension in the browser after changes if hot reload does not pick them up.

## Load the extension in the browser

### Chrome

1. Run `pnpm dev`
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Select the folder: `.output/chrome-mv3`

### Firefox

1. Run `pnpm dev:firefox`
2. Open `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on**
4. Select any file inside `.output/firefox-mv2` (e.g. `manifest.json`)

## Production build

```bash
pnpm build          # Chrome
pnpm build:firefox  # Firefox
pnpm build:zip      # Chrome folder + .zip in one command
pnpm zip            # Chrome .zip for store sideload
pnpm zip:firefox    # Firefox .zip
```

Output goes to `.output/`.

## Project layout

```
src/
  config.ts                    # URL patterns & API base
  entrypoints/
    background.ts                # Service worker
    granot-crm.content.ts        # Runs on Granot CRM pages
    popup/                       # Toolbar popup UI
  utils/
    api.ts                       # Server calls
    logger.ts                    # Console logging helper
```

## Configure Granot URL

Edit `src/config.ts` and set `GRANOT_URL_PATTERNS` to match your Granot CRM hostname. Also update `host_permissions` in `wxt.config.ts` if needed.

## Debugging

1. Open Granot CRM in a tab
2. Open DevTools → **Console**
3. Filter for `[Granot Sync]`
4. Click the extension icon → **Ping Vantage server** to test connectivity

## Next steps

- Map Granot DOM fields in `granot-crm.content.ts`
- Add a real POST endpoint in `src/utils/api.ts`
- Store credentials or settings via `browser.storage` (never hardcode secrets in the extension)
