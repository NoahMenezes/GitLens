# Changelog

All changes to SelectBeam will be listed here.

## [0.0.4] — 2026-09-15

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

## [0.0.3] — 2026-09-15

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
