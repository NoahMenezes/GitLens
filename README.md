# SelectBeam

> Highlight code, press one shortcut, and your code is ready for AI. No copy-paste.

SelectBeam takes the code you selected and hands it to an AI for you, along
with the file name and line numbers so the AI knows where it came from.

Repo: https://github.com/NoahMenezes/SelectBeam

Example. You select this:

```python
def merge(arr, low, mid, high):
    ...
```

SelectBeam sends this:

````markdown
```python
// MergeSort.py (lines 12-25)
def merge(arr, low, mid, high):
    ...
```
````

You then review it and press Enter yourself. SelectBeam never submits for you.

## What you need

1. **VS Code 1.85 or newer.** That is all most people need.
2. One of these, depending on how you want to work:
   - **Terminal way:** one AI tool installed — `opencode`, `claude`,
     `codex`, `copilot`, or `aider`.
   - **Browser way:** no install needed. Just pick ChatGPT, Claude,
     Gemini, or DeepSeek and SelectBeam opens it for you.
   - **Browser way with tab reuse (recommended):** install the free
     `browser/` companion in Firefox (see below). Then repeat sends go to
     the SAME chat tab instead of opening a new tab every time.

No account, no API key, no setup. Install the extension and use it.

## How to use

**1. Highlight some code** in any file.

**2. Send it.** Any of these work:

- Press `Ctrl+Alt+A` on Windows/Linux (`Cmd+Alt+A` on Mac).
- Or press `Ctrl+Shift+P` (`Cmd+Shift+P` on Mac), type `SelectBeam`,
  and pick a command.
- Or right-click the highlighted code and pick a SelectBeam command.

The shortcut only works when text is highlighted. It is 3 keys on purpose
(the old 4-key `Ctrl+Alt+Shift+A` was hard to press and clashed for many).

**3. Answer one question if asked.**

- If no terminal is open, pick where the code should go:
  a terminal AI, a browser AI, or just the clipboard.
- If a terminal is open but SelectBeam has not used it before, it asks
  before putting anything there. Pick “Agent already running here” only
  if you can already see your AI tool waiting in that terminal.
  Otherwise pick the tool to start, or clipboard.

**4. Check and submit yourself.**

- Terminal: your code appears in the AI tool’s input box. Look it over,
  add anything else, then press Enter.
- Browser without companion: your code is copied and the chat site opens.
  Press `Ctrl+V` once (`Cmd+V` on Mac) in the chat box.
- Browser with companion: your code is sent to the same tab and
  auto-fills there in ~2 seconds — no questions, no pasting. Still review
  it yourself — SelectBeam never presses Enter for you. First-ever send
  to a new AI opens its chat and auto-fills when it loads.

## Mac keys

| Windows / Linux | Mac | Note |
|---|---|---|
| `Ctrl+Alt+A` | `Cmd+Alt+A` | Send shortcut. On Mac keyboards `Option` is `Alt`. |
| `Ctrl+V` | `Cmd+V` | Paste into the browser chat box. |
| `Ctrl+Shift+P` | `Cmd+Shift+P` | Command palette. |
| `Ctrl+,` | `Cmd+,` | Settings. |

If the shortcut does nothing on Mac, open
File → Preferences → Keyboard Shortcuts, search “SelectBeam”, and rebind
it — macOS sometimes reserves `Cmd+Alt` combos.

## The four commands

| Command | How to reach it | What it does |
|---|---|---|
| SelectBeam: Send Selection to AI | Shortcut, right-click, or palette | Sends your selection to a terminal AI. If you prefer, you can also pick a browser AI from the same list. |
| SelectBeam: Send Selection to Browser AI (ChatGPT / Claude / Gemini / DeepSeek / Grok / Copilot) | Palette or right-click | Always lets you pick the AI (and remembers it). One-tap after that. |
| SelectBeam: Choose Send Target | Palette only | Changes where future sends go: back to Auto, clipboard only for this session, or one fixed terminal. Auto also clears live tabs. |
| SelectBeam: Show Browser Bridge Status | Palette only | Shows bridge port, linked tabs, and queued items. |

## Settings

Open Settings (`Ctrl+,` or `Cmd+,`), search `SelectBeam`. Defaults work
for most people.

| Setting | Default | What it means |
|---|---|---|
| `selectbeam.defaultTarget` | `"auto"` | `"auto"` tries the terminal first and copies if needed. `"clipboard"` always just copies. `"terminal"` always uses the terminal. |
| `selectbeam.rememberTerminalChoice` | `true` | Remembers which terminal you picked so you are asked once, not every time. |
| `selectbeam.askForPrompt` | `true` | Asks for a short note after your code, for example “explain this”. Leave it empty to send code only. |
| `selectbeam.agentStartDelayMs` | `2000` | How long to wait after starting an AI tool before putting code in, so the tool has time to open. In milliseconds. |
| `selectbeam.agentCommands` | `{}` | If one of your AI tools starts with a different command, write it here. Example: `{ "copilot": "gh copilot" }`. |
| `selectbeam.defaultBrowser` | `"last"` | Ask once, then automatic. `"ask"` asks every time. Or fix one: `"chatgpt"`, `"claude"`, `"gemini"`, `"deepseek"`, `"grok"`, `"copilot"`. The palette command always lets you pick (and updates last). |
| `selectbeam.rememberBrowserChoice` | `true` | Remembers your browser pick so `"last"` works. |
| `selectbeam.browserUrls` | `{}` | If a chat site address changes, write it here. Example: `{ "deepseek": "https://chat.deepseek.com/" }`. |
| `selectbeam.reuseBrowserTab` | `true` | Reuse the linked browser tab instead of opening a new tab every time. Needs the companion. |
| `selectbeam.liveTabTTLMinutes` | `60` | How long a linked tab counts as fresh. After this, a new chat is opened. |
| `selectbeam.bridgeEnabled` | `true` | Run the localhost bridge so the companion can link tabs. Turn off for copy+open only. |
| `selectbeam.bridgePort` | `51337` | Localhost port for the bridge. Change only if taken. |

To reset everything, run **SelectBeam: Choose Send Target** and pick
**Auto**. That clears the saved terminal, the saved browser, live tabs,
and the clipboard-only mode.

## Browser companion — Firefox first (no internet needed, no setup)

The companion is vanilla MV3 (`browser/` folder, no `npm install`, no build).
Firefox first, Chrome/Edge next with the same files. It works with ChatGPT,
Claude, Gemini, DeepSeek, Grok, and Copilot — every model the same way.

**There is nothing to pair.** No token, no account, nothing to type. Every
chat tab links itself the moment it loads.

**Firefox setup (temporary install, good for daily use):**

1. In Firefox, open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on**, pick the file
   `browser/manifest.json` from this repo. Confirm “SelectBeam Bridge”
   appears.
3. Open your chats (ChatGPT, Claude, …) in tabs and keep them open.
4. Back in VS Code: highlight code, press `Ctrl+Alt+A`
   (`Cmd+Alt+A` on Mac), pick an AI once. The tab auto-fills in
   ~2 seconds. Every further send refills the same tab — no new tabs,
   no pasting, no questions.

First-ever send to a new AI opens its chat and still auto-fills when it
loads. Switch AI anytime via the palette command **SelectBeam: Send
Selection to Browser AI**, which always lets you pick (and updates last).

Notes:

- Temporary add-ons unload when Firefox closes. Re-load after restart
  (takes 10 seconds). Nothing to re-pair.
- For a permanent install you need signing (Mozilla Add-ons) or
  Firefox Developer / ESR with `xpinstall.signatures.required = false`.
  That step needs internet once — skip it while offline.
- The bridge is `http://127.0.0.1:51337` only. No data leaves your
  machine. Websites are locked out by extension-origin check, so there is
  no password to manage. Endpoints: `GET /status`, `POST /tabs`,
  `GET /pending`, `POST /ack`, `POST /filled`, `POST /bye`, `GET /tabs`,
  `POST /queue`.
- Keep one VS Code window owning the bridge. A second window shows a
  warning and falls back to copy+open.

**Chrome / Edge (when you are ready):**

1. Copy `browser/manifest.chrome.json` over `browser/manifest.json`
   (only the `background` key differs).
2. Open `chrome://extensions`, enable Developer mode, **Load unpacked**,
   pick the `browser/` folder.
3. Same as Firefox from there — no pairing, tabs self-link.

**WXT later (optional):** when you have good internet, the same logic
ports 1:1 to WXT (`entrypoints/background.ts`, one content file per
match, `utils/protocol.ts`). Nothing in `src/extension.ts` needs to
change — the HTTP endpoints stay identical. See
`browser/WXT-MIGRATION.md`.

## Two things to know

1. **SelectBeam never presses Enter for you.** Your code waits in the
   AI tool until you submit it. This is on purpose so you can check it first.
2. **Without the companion, the browser way needs one paste.**
   SelectBeam copies and opens the site, you press `Ctrl+V` (`Cmd+V` on
   Mac) once. With the companion linked, that paste is automatic. If the
   copy is lost, use the “Copy again” button in the notification.

## If something goes wrong

**Nothing happens when I press the shortcut.**
Highlight code first. The shortcut only works with an active selection.
If it still does nothing, another extension may use the same keys —
change it under File → Preferences → Keyboard Shortcuts, search
“SelectBeam”.

**The browser opened a new tab every time.**
That means no tab is linked yet — the companion may have unloaded
(temporary add-ons unload on Firefox restart) or the chat was closed
(closing a chat forgets it at once, so the next send opens fresh).
Reload in `about:debugging`, keep the chat open, send again. Check
**Show Browser Bridge Status** for live tabs.

**Page badge says “VS Code bridge off?”.**
Make sure VS Code is open (the bridge runs inside the extension),
`selectbeam.bridgeEnabled` is on, and the port matches (`51337`).
Only `127.0.0.1` works — that is on purpose. Click the badge to retry.

**The browser opened but the chat box is empty.**
Wait a few seconds — first-ever sends auto-fill when the editor loads
(~30s budget). Your code is also in the clipboard: press `Ctrl+V`
(`Cmd+V` on Mac) if you don't want to wait. If the site redesigned its
input, only `browser/content.js` selectors need updating.

**Tab is linked but never auto-fills.**
Green badge but empty means the fill failed: the page tells you via toast,
and after ~30s it asks for one manual paste. Reload the temporary add-on
in `about:debugging` (it may have unloaded), then send again. Last resort:
report the site + what the toast said — only the `SELECTORS` table in
`browser/content.js` needs the new hook.

**My terminal shows `bquote>` lines.**
That means code was put into a plain shell instead of an AI tool.
Press `Ctrl+C` to get your prompt back, then make sure your AI tool
(`opencode`, `claude`, and so on) is actually running in that terminal
before sending again. Current SelectBeam asks before using an unknown
terminal, so this should be rare.

## Building from source (developers only, offline-safe)

Normal use does not need any of this. Only for working on the extension
itself. No `npm install` / `bun install` needed — `node_modules` is
already vendored:

```bash
bun run check-types  # type-check only (local tsc, no download)
bun run compile      # one-off build (local esbuild)
bun run watch        # rebuild on every save (used by F5)
bun run package      # minified production build
```

Then press **F5** in VS Code to open the Extension Development Host.
VS Code side is `src/` (one module per concern: `extension.ts` wires,
`commands.ts` orchestrates, `terminal.ts` / `browserSend.ts` send,
`bridge.ts` serves localhost, `state.ts` / `config.ts` / `payload.ts` /
`types.ts` / `constants.ts` / `platform.ts` support).
Browser side is `browser/` (no build).
