# Changelog

All changes to SelectBeam will be listed here.

## [Unreleased] — cleanup + Windows fix

- Removed all code comments (archived in `docs/CODE-NOTES.md`) and shortened
  sources ~30% with identical behavior and messages. README rewritten to current
  status and trimmed.
- Fixed: named browser apps (Brave/Chrome/Edge/Firefox) now resolve via
  well-known Windows install paths, not just PATH. Falls back to system default
  as before.
- Fixed: collapsed the dead `terminal`/`auto` branch split in `sendSelection`
  (both did the same launch flow).

- Brave now auto-pastes like Chrome/Edge: Brave-gated branch in `browser/content.js`
  (shadow-DOM search for Gemini `rich-textarea`, `beforeinput`+`insertText` insert for
  ProseMirror/Lexical/Slate editors, longer retry, queue never dropped, badge-click retry).
  Shared Chrome/Edge/Firefox paths byte-identical — zero regression risk.
- `browser/background.js`: Brave-only `focusTab` brings the filled tab to front.
- New `selectbeam-bridge-brave-0.0.4.zip` + `browser/manifest.brave.json` +
  `browser/build-brave-zip.sh`. Brave loads via `brave://extensions` → Load unpacked.
- New `browser/CWS-LISTING.md`: copy-paste Chrome Web Store listing (one listing covers
  Brave + Chrome + Opera + Vivaldi + Arc) for when you're ready to post.

## [0.0.5] — 2026-09-15

- New system-browser picker: AI -> browser app -> Existing tab / New tab. Supports system default, Firefox, Edge, Chrome, Chromium, Brave (`selectbeam.systemBrowser` + `rememberSystemBrowserChoice`). Missing binary falls back to system default, code never lost.
- Edge Add-ons store submission (Chromium `service_worker` build). Firefox AMO + Edge done, Chrome Web Store covers Brave/Chromium.
- Marketplace description refresh for the new flow.

## [0.0.4] — 2026-09-16

- Store resubmit of 0.0.3 for AMO (0.0.3 was uploaded then deleted, AMO blocks reuse of deleted version numbers). No code change.

## [0.0.3] — 2026-09-15

- Fixed companion paste: the chat box fill is now verified (text must
  actually appear), with three strategies in order — editor-native
  `insertText`, native value setter, append + input event — instead of one
  blind attempt. Still never auto-submits.
- Failed pastes retry each poll (~30s budget), then fall back to a manual
  `Ctrl+V` / `Cmd+V` toast. Nothing is lost: VS Code always copies first.
- New on-page diagnostics: amber “not linked” vs green “linked ✓” badge
  (click = fill now), plus toasts when code arrives but the editor isn't
  ready. Editor re-poll on DOM change and tab focus for SPA navigation.

- Split `src/extension.ts` (1342 lines) into modules: `types`,
  `constants`, `platform`, `config`, `payload`, `state`, `bridge`,
  `terminal`, `browserSend`, `commands`; `extension.ts` is wiring only.
  No behavior change — same commands, settings, and bridge endpoints.
- Audited repo hygiene: stale `selectbeam-0.0.2.vsix` and `dist/` are
  already git-ignored and untracked — no action needed.
- Fixed: bridge called `server.close()` on a never-listening server after
  a failed bind (`ERR_SERVER_NOT_RUNNING`) — now only a bound server is
  kept/closed.
- Fixed: Show Bridge Status used a modal warning for an info dump — now a
  modal info message.
- Fixed: prod build left a stale dev `extension.js.map` in `dist/` —
  `esbuild.js` now removes it on `--production`.
- Simplified live-tab check to a single confirmed-title test.

- Repo fixed to https://github.com/NoahMenezes/SelectBeam (remote was
  pointing at GitLens). Added repository/homepage/bugs fields.
- Shortcut 4 keys -> 3 keys: Ctrl+Alt+A (Cmd+Alt+A on Mac). Old
  Ctrl+Alt+Shift+A retired after friend reports.
- Mac: dedicated `mac` binding, Cmd+V / Cmd+Alt+A hints in every message,
  Mac key table in README (Option = Alt).
- New tab-reuse memory: the browser companion reports its live tab
  (provider + url + title) to VS Code; repeat sends refill the SAME tab
  instead of opening a new ChatGPT tab every time. Expires after
  `liveTabTTLMinutes` (60m). Missing/closed chat opens a new one.
- New localhost bridge (Node http only, zero deps, offline-safe):
  GET /status, POST /tabs, GET /pending, POST /ack, GET /tabs, POST /queue.
  Token auth, CORS-open for the companion, single-window ownership with
  copy+open fallback.
- New `browser/` companion (Firefox first, vanilla MV3, no npm install):
  content heartbeat + 2s poll + per-site chat-box inject (never submits),
  popup token/link/test, Chrome variant via manifest.chrome.json.
- New Show Browser Bridge Status command (copies token, lists live tabs).
- New settings: reuseBrowserTab, liveTabTTLMinutes, bridgeEnabled,
  bridgePort. Choose Target -> Auto now also clears live tabs + queue.
- Zero-setup auth: token deleted. Background page owns all bridge traffic
  and the server trusts the extension Origin, so websites stay locked out
  with nothing to copy. Popup is status-only.
- Always-queue: every send is queued, so first-ever sends auto-fill when
  the chat loads. Browser sends skip the instruction prompt (one-tap).
- Palette browser command always lets you pick (updates last);
  `defaultBrowser` default is now `"last"` — ask once, then automatic.
- New providers Grok (grok.com, x.com/i/grok) and Copilot
  (copilot.microsoft.com): same flow, same selectors machinery.
- Same-tab memory is now exact: closing/navigating away tells VS Code at
  once (`POST /bye`), and only tabs heartbeated in the last 90s are reused
  — a dead tab never swallows a send, a fresh chat opens instead.
- Fill confirmation back into VS Code (`POST /filled`): the moment code
  lands in the chat box you get a "pasted into your tab" message and the
  tab is re-remembered for the next send.
- Last used vs New chat: first send opens a new chat; from the second send
  on you pick **Last used tab** (refill) or **New chat** (fresh start,
  old tab forgotten at once) — for every model.
- Companion covers all famous browsers with the two existing builds, no
  code change: Chromium family (Chrome, Edge, Brave, Opera, Vivaldi, Arc)
  via `manifest.chrome.json`, Firefox family (Firefox, Dev, Zen,
  LibreWolf, Waterfox, Floorp) via `manifest.json`. Safari later (needs
  Xcode + Mac). New `browser/CHROMIUM-SETUP.md` printable guide.
- Terminal agents: +7 — Gemini CLI (`gemini`), Qwen Code (`qwen`), Cursor
  agent (`cursor-agent`), Amp (`amp`), Anti-Gravity (`agy`), Crush
  (`crush`), Goose (`goose`). Any binary name overridable via
  `selectbeam.agentCommands`.

## [0.0.2] — 2026-09-14

- Renamed to SelectBeam.
- Send to terminal AI tools: OpenCode, Claude Code, Codex CLI, Copilot CLI,
  and aider. SelectBeam can start the tool for you, puts your code in its
  input box, and never presses Enter for you.
- New Send to Browser AI: ChatGPT, Claude, Gemini, and DeepSeek. SelectBeam
  copies your code and opens the site. You paste once with Ctrl+V.
- One list to pick from: terminal tools, browser sites, or just clipboard.
- New Choose Send Target command: back to Auto, clipboard only for this
  session, or one fixed terminal. Auto also clears the saved terminal and
  browser picks.
- Asks for an optional short note after your code, for example “explain
  this”. Leave it empty to send code only.
- Asks before using a terminal it has not used before, so code is never
  dropped into a plain shell by mistake.
- Shortcut changed to Ctrl+Alt+Shift+A (Cmd+Alt+Shift+A on Mac) so it no
  longer clashes with other extensions. Works only when text is highlighted.
- Right-click menu now has both Send to AI and Send to Browser AI.
- New settings: send target, remember terminal, ask for note, start delay,
  custom tool commands, default browser, remember browser, and custom
  browser addresses.

## [0.0.1] — 2026-09-14

- First version.
- Send Selection to AI: highlighted code is formatted with the file name
  and line numbers and copied to the clipboard, with a confirmation message.
- Shortcut and right-click menu for the selection.
