# SelectBeam browser companion — WXT migration note (for later, needs internet once)

Current `browser/` is vanilla MV3 on purpose: zero dependencies, works
offline, Firefox-first. When you have good internet and want store builds,
port it to WXT 1:1 — the VS Code HTTP endpoints do NOT change.

## File mapping

| Vanilla now | WXT later |
|---|---|
| `manifest.json` | `wxt.config.ts` (manifest generated) |
| `background.js` | `entrypoints/background.ts` (`defineBackground`) |
| `content.js` (provider switch inside) | `entrypoints/chatgpt.content.ts`, `claude.content.ts`, `gemini.content.ts`, `deepseek.content.ts` (or one file with 4 `matches`) + `utils/selectors.ts` |
| `popup.html` + `popup.js` | `entrypoints/popup.html` + `popup/main.ts` |
| `browser.storage.local` token/port | `wxt/storage` (`storage.defineItem`) |

## Keep identical

- localhost base `http://127.0.0.1:{port}` and all 6 endpoints + JSON shapes
  (`/status`, `/tabs` GET+POST, `/pending`, `/ack`, `/queue`).
- Token auth: `?token=` for GET, `{ token }` for POST. CORS `*`.
- Poll 2s, heartbeat 15s, title-change re-heartbeat.
- Per-provider selector table and React-safe `insertText` injection.
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
this folder. Test matrix: link → send → reuse, kill tab → new chat,
401 bad token, bridge down fallback, Chrome unpacked via `manifest.chrome.json` logic.
