# SelectBeam browser companion — WXT migration note (for later, needs internet once)

Current `browser/` is vanilla MV3 on purpose: zero dependencies, works
offline, Firefox-first. When you have good internet and want store builds,
port it to WXT 1:1 — the VS Code HTTP endpoints do NOT change.

## File mapping

| Vanilla now | WXT later |
|---|---|
| `manifest.json` | `wxt.config.ts` (manifest generated) |
| `background.js` | `entrypoints/background.ts` (`defineBackground`) |
| `content.js` (provider switch inside) | one content file with all `matches` + `utils/selectors.ts` + `utils/inject.ts` |
| `popup.html` + `popup.js` | `entrypoints/popup.html` + `popup/main.ts` (status only) |
| `browser.storage.local` port | `wxt/storage` (`storage.defineItem`) |

## Keep identical

- localhost base `http://127.0.0.1:{port}` and all 6 endpoints + JSON shapes
  (`/status`, `/tabs` GET+POST, `/pending`, `/ack`, `/queue`). No token —
  server trusts the extension Origin; background page owns all fetches.
- Poll 2s, heartbeat 15s, title-change re-heartbeat.
- Per-provider selector table and verified `insertText` injection.
- Never auto-submit.

## Commands (needs internet once)

```bash
cd browser
npm create wxt@latest .   # or: bunx wxt@latest init .
npm install               # downloads Vite + WXT
npm run dev               # Firefox: npm run dev:firefox
npm run build && npm run zip
```

Then `Load Temporary Add-on` the `.output/firefox-mv3/` build instead of
this folder. Test matrix: send → reuse, kill tab → new chat autofills,
page-origin denied, bridge down fallback, Chrome unpacked via `manifest.chrome.json` logic.
