# SelectBeam — Code Notes (archived comments)

All explanatory comments stripped from the source during the cleanup live here,
organized per file. Code files are comment-free; read this alongside them.

Conventions used across the codebase: `// Esc` = user dismissed a picker, so do
nothing (clipboard already holds the code). Bare `catch {}` = best-effort step;
failure is already covered by a fallback or retry.

## `src/extension.ts` — entrypoint (wiring only)

- Behavior lives in modules: `types` (shared types, no runtime code),
  `constants` (storage keys, limits, agent + browser catalogs), `platform`
  (Mac hints, sleep), `config` (all `selectbeam.*` settings reads), `payload`
  (code-block building, clipboard, optional instruction), `state`
  (workspace/global state), `bridge` (localhost HTTP bridge + status),
  `systemBrowser` (browser APP picker + launcher), `terminal` (terminal send
  path), `browserSend` (browser send path), `commands` (orchestration).
- Send paths (all free, no API keys, no internet beyond localhost):
  - TERMINAL: format selection as markdown, ensure an AI CLI runs in the target
    terminal BEFORE pasting (never blind-paste ``` into a shell).
  - BROWSER without companion: copy + openExternal(); user pastes once.
  - BROWSER with companion: companion heartbeats its live tab to the bridge and
    polls queued code, so the SAME tab is refilled. Missing or dead chat opens a
    new one. Never auto-submits.
- The localhost bridge starts in the background and never blocks activation; if
  the port is taken (second window), that window stays in copy+open mode.

## `src/commands.ts` — palette commands

- `selectbeam.sendSelection` is terminal-first. Clipboard-only modes just copy.
  No terminal leads to a destination picker; existing terminal(s) go through
  target resolution + the agent guard.
- Strict `"terminal"` mode still needs a terminal: create + launch instead of
  erroring, since the extension can bootstrap the agent itself.
- `"auto"` with no terminal asks (launch) rather than silently copying, but keeps
  a clipboard escape hatch in the same picker.
- `selectbeam.chooseTarget` = reset to Auto / clipboard-only / pin a terminal.
  Auto also clears the agent map + live tabs + bridge queue so the next send
  re-verifies everything.

## `src/terminal.ts` — terminal send path

- The agent guard is what stops the `bquote>` bug: never paste a ``` fence into
  a plain shell unasked.
- Target resolution order: remembered terminal (if still open) -> single open
  terminal (active one preferred) -> quickpick.
- No-terminal flow picks a destination (terminal agent | browser AI | clipboard)
  and returns whether something was sent/launched; clipboard/dismiss = false.
- A terminal agent gets a dedicated new terminal so other terminals aren't hijacked.
- Existing target terminal: if an agent was previously launched there, paste
  directly with no questions. Otherwise ask: "already running -> paste" vs
  "launch X now" vs browser AI vs clipboard.
- "Agent already running" is trusted on the user's word and stored as
  `"__external__"` (not in AGENTS); the paste path handles it.
- Launch + paste: `sendText(cmd, true)` EXECUTES the command, wait for TUI
  startup, then paste code with `sendText(payload, false)` so it is NOT submitted.
- Paste step: `sendText(final, false)` = do NOT press Enter. Code sits in the
  agent's prompt; the user reviews, optionally types more, then submits manually.

## `src/browserSend.ts` — browser send path

- Flow: pick AI chat -> pick browser app (Firefox / Edge / system) -> pick
  Existing tab vs New tab. Clipboard is ALWAYS written first so nothing is ever
  lost. Every send is ALSO queued on the bridge, so even a first-ever send to a
  new AI auto-fills when its chat loads. First send opens a new chat; from the
  second send on the user chooses Last used tab vs New chat. Never auto-submits.
- `selectbeam.sendToBrowser` (palette) ALWAYS shows the picker so switching models
  is one command away. The pick updates "last".
- `resolveBrowser`: fixed default is used directly; `"last"` uses the remembered
  pick (or picker on fresh installs); `"ask"` shows the picker with clipboard
  fallback. Unknown ids (e.g. after an update) fall through to the picker.
- Browser sends never ask for an instruction note (the terminal path still honors
  `selectbeam.askForPrompt`); code goes as-is.
- Which browser APP opens the chat is a separate step (Esc keeps the clipboard
  copy and queues nothing).
- Second send onwards with a fresh tab: refill the last used tab, or open a
  brand-new chat in the picked browser app (old tab forgotten at once, stays open).
  First send (no live tab) always opens a new chat.
- The "Existing tab" choice is quiet on purpose: the fill confirmation from the
  tab itself pops the message in VS Code.
- `openFreshChat` is shared by first-send, explicit new-tab, and bridge-off
  fallbacks — only the hint text differs.

## `src/bridge.ts` — localhost HTTP bridge (Node http only, zero deps)

- Lets the browser companion report its live tab and pick up queued code, so
  repeat sends reuse the SAME tab instead of opening new tabs.
- Zero-setup auth: the ONLY callers are the companion's background page (Origin
  `moz-extension://` / `chrome-extension://`) and local tools with no Origin
  (e.g. the second VS Code window's `/queue` forward). Any http(s) page origin is
  rejected — websites can never touch the bridge, so there is no token to copy.
- Endpoints: `GET /status` (health + counts), `POST /tabs` (heartbeat remembers
  live tab), `GET /pending?provider=` (companion polls), `POST /ack` (companion
  confirms pickup, item dropped), `POST /filled` (chat box was actually filled:
  refresh tab memory + message the user back in VS Code), `POST /bye` (tab
  closed/navigated away: forget it NOW so the next send opens a FRESH chat),
  `GET /tabs` (popup status), `POST /queue` (multi-window forward from a window
  that does NOT own the port).
- `GET /status` is an open health check (no live data beyond counts); everything
  else requires companion-or-local origin.
- Never call `close()` on a server that failed to bind: Node throws
  `ERR_SERVER_NOT_RUNNING` for `close()` without `listen()`. A `bound` flag is
  tracked and only a bound server is kept/closed; an unbound server is left alone
  (never listened, nothing to close, no handle leak).
- `POST /filled` also pushes a VS Code info message + 5s status-bar confirmation.
- `stopBridgeServer` guards `close()` — only a listening server may be closed.
- `showBridgeStatus` originally used a modal warning for an info dump; it is a
  modal info message.

## `src/state.ts` — all vscode state

- `workspaceState` = per-folder memory (terminals, last browser pick).
- `globalState` = machine memory (live tabs, so the companion popup works across windows).
- `KEY_AGENT_MAP`: terminal name -> agent id launched there. Absence means
  "unknown / probably plain shell" -> ask before pasting.
- Only CONFIRMED live tabs count: provisional entries (written when opening a chat
  URL, before the companion heartbeats) have an empty title and are ignored.
- Freshness: open tabs heartbeat every 15s, so anything older than the reuse
  window (90s, capped by the TTL setting) is a closed/navigated-away tab — open a
  fresh chat instead of sending into a dead tab. TTL stays as the outer bound.
- Never overwrite a confirmed live tab with a provisional one.
- A fill confirmation refreshes the tab heartbeat so it stays remembered.
- `setLiveTab(provisional=true)` callers must pass real heartbeat data otherwise.

## `src/config.ts` — settings reads

- All `selectbeam.*` reads in one place, so defaults live next to `package.json`
  and behavior modules stay thin.
- `"last"` = ask once, then automatic (browser + system browser).
- `bridgePort` is validated (integer 1–65535) with fallback to 51337.

## `src/constants.ts` — constants and catalogs

- No vscode import; pure data so every module can share it.
- Origin schemes allowed on the bridge = companion only; web pages send http(s)
  origins and are rejected, so no token is needed.
- `MAX_PENDING` = 20 queued pastes kept in memory (temporary, not persisted).
- Reuse window 90s: a tab only counts as "the same tab" if it heartbeated within
  the last 90s. Open tabs beat every 15s, so a live tab always passes; a closed
  tab stops beating and a FRESH chat opens instead of sending into the void.
- Max JSON body 2MB; max queued paste text 500KB (on the `/queue` forward path).
- Run-once tools (e.g. `sgpt`) are intentionally NOT in AGENTS: they exit
  immediately, so launch-then-paste cannot work with them.
- Free browser chat targets; URLs are the canonical "new chat" entry points.
- System browsers: `system` uses OS default via `vscode.openExternal`; named apps
  spawn their binary directly. New entries appear in picker + settings automatically.

## `src/payload.ts` — payload building

- VS Code extensions CANNOT type into external browser tabs, so the browser path
  always copies first; the terminal path types into the agent prompt.
- Instruction prompt: empty / Esc = code only. The agent waits for the user
  either way — Enter is never pressed after pasting.

## `src/platform.ts` — platform helpers (no vscode import)

- Paste key hint: `Cmd+V` on Mac, `Ctrl+V` elsewhere. Shortcut hint:
  `Cmd+Alt+A` on Mac, `Ctrl+Alt+A` elsewhere.

## `src/types.ts` — shared types (no runtime code)

- Imports vscode only for the QuickPickItem extensions used by pickers.
- `defaultCommand` (agent) / `defaultUrl` (browser) are overridable via settings.
- `PendingPaste` items are in-memory only.

## `src/systemBrowser.ts` — browser app picker + launcher

- The AI chat (ChatGPT, Gemini, …) is separate from the APP that opens it.
- `system` uses `vscode.openExternal` (OS default). Named apps spawn their binary
  directly (Linux / Mac / Windows) so Firefox vs Edge is a real choice.
- Named apps fall back to `openExternal` when their binary is missing (with a
  warning), so the send is never lost.
- Each entry is `[command, ...fixedArgs]` with the URL appended last (except mac
  `open -a`). Linux binary names follow vendor docs. On Windows, bare names are
  probed via `where` (PATH) and well-known install paths via existence check;
  absolute paths spawn without a shell to avoid quoting issues.

## `browser/content.js` — content script (all providers, one file)

- Runs on ChatGPT, Claude, Gemini, DeepSeek, Grok, Copilot pages. It NEVER talks
  to the bridge directly: all networking goes through the background page (whose
  requests carry the extension Origin the server trusts). This script only finds
  chat boxes, pastes verifiably, and reports. Zero setup — no token, no pairing.
- Loop: heartbeat "I am this chat tab" + poll "anything for me?" -> inject queued
  code -> confirm pickup. Paste, never send: only fills the chat box.
- Promise-safe `sendMsg`: Firefox returns a promise, Chrome needs a callback.
- Per-site chat-box selectors, most-specific first, with a generic
  role/visibility fallback covering redesigns and new models (chat inputs are big
  visible editables). If autofill stops after a site update, the `SELECTORS`
  table is the ONLY thing needing new entries.
- `attempts[id]` counts failed paste tries per queued item; `toastedNoBox` /
  `toastedManual` flags nag once per item.
- Largest-visible-editable wins: chat inputs are the biggest contenteditable on
  these pages; tiny editables are usually comments. Specific-selector hits and
  drilled-in inner editors (e.g. inside `rich-textarea`) are trusted immediately.
- `verified()`: head-snippet check — first 40 non-space chars must be present.
- Strategy 1 (ProseMirror/Lexical/Slate like ChatGPT): caret to end +
  `execCommand("insertText")` so the editor's own model updates.
- Strategy 2 (plain textarea/input): native value setter + input/change events so
  React/Vue controlled inputs notice.
- Strategy 3 (last resort, contenteditable): if the editor only holds a
  placeholder paragraph, clear it first; append a text node + synthetic input event.
- Toast/badge styling is inline; a page CSP blocking inline styles is non-fatal.
- Badge: green = linked, amber = bridge unreachable. Click = fill now.
- `giveUpManual` (non-Brave): ack the item and show one manual-paste toast; the
  code is always in the clipboard.
- Same chat box serves all queued items for that provider; retry next poll until
  the budget runs out (~15 tries ≈ 30s, covers cold loads).
- `pollSoon` (MutationObserver, SPA navigation + editor late-load): re-poll right
  when the chat box appears; title changes re-heartbeat.
- `pagehide` tells VS Code to forget the tab NOW (backup; background `onRemoved`
  is the primary path). Intervals still cover environments without observers.
- Brave-only additions: longer budget (~60s) because `execCommand` is disabled
  earlier in Brave and Gemini's input lives in a shadow DOM; `IS_BRAVE` detection
  via `navigator.brave.isBrave` + UA; shadow-DOM-piercing search with shared
  search as fallback; model-aware insert dispatching `beforeinput` + `input` with
  `inputType: insertText` at the deepest paragraph, shared pipeline as fallback;
  queue is NEVER dropped for Brave (kept for next poll/badge click); tab is
  brought to front after fill (requested). Non-Brave never calls any of this.

## `browser/background.js` — background script

- Owns ALL bridge networking so the server can trust the extension Origin
  (`moz-extension://` / `chrome-extension://`) instead of a token. Web pages can
  never send that Origin: zero token, zero pairing. Works as Firefox
  `scripts` background and Chrome `service_worker` alike.
- Content-script fetches would carry the PAGE's Origin (rejected by the server),
  so background does every fetch. Content scripts stay alive while a chat tab is
  open and wake this page with messages, so event-page suspension is harmless.
- `tabProviders` (tabId -> provider) lets `onRemoved` tell VS Code exactly which
  chat closed. Tracking is best-effort only.
- `ack` failure leaves the item queued (may refill once — acceptable).
- `filled` failure (VS Code closed mid-fill) is fine: code is already in the box.
- `bye` with no provider is a no-op; bridge-down is covered by the staleness window.
- `status` merges bridge health + live tabs; tabs fetch failure yields `{}`.
- Async replies return `true` to keep the message channel open (both browsers).
- `tabs.onRemoved` tells VS Code immediately so the next send opens a FRESH chat.
- `onInstalled` seeds the default port in storage; storage failure still works
  in-memory. Unsupported environments degrade content scripts to manual paste.
- `focusTab` (Brave only): activates the just-filled tab + focuses its window.
  Needs only the existing `tabs` permission. Best-effort; the fill already landed.

## `browser/popup.js` — popup (status only)

- Firefox + Chrome compatible, no deps. No token, nothing to pair. All bridge
  traffic goes through the background page; the popup just asks "how are we?".

## `esbuild.js` — bundler

- esbuild over webpack: much faster, zero-config, single file. VS Code only needs
  one output: `dist/extension.js` (the `main` field in `package.json`).
- `vscode` stays external — VS Code injects it at runtime, so it must NOT bundle.
- Formats: CommonJS (extension host), node platform, node18 target.
- Dev builds keep sourcemaps; `--production` minifies and deletes the stale dev
  map so `dist/` never ships a mismatched map.
- Scripts run via Bun per project convention: `compile` (one-off), `watch`
  (rebuild on save, used by F5), `package` (minified production build).

## `tsconfig.json`

- Targets modern Node (extension host) + CommonJS. `tsc` only type-checks
  (`check-types` script); esbuild bundles from `src/`.

## `.vscode/` configs

- `extensions.json`: recommended extensions for hacking on SelectBeam itself.
- `launch.json`: F5 launches the Extension Development Host with SelectBeam loaded;
  picks up esbuild sourcemaps for breakpoints; runs the default build task first;
  silences harmless Node deprecation noise from VS Code's own host.
- `settings.json`: format + organize imports on save.
- `tasks.json`: `bun run watch` rebuilds on every save so F5 picks up changes.
