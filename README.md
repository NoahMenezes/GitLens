# SelectBeam

> Highlight code, press one shortcut, send it to terminal AI or browser AI — same tab every time. No copy-paste.

SelectBeam hands your selected code to an AI, with file name and line numbers attached:

````markdown
```python
// MergeSort.py (lines 12-25)
def merge(arr, low, mid, high):
    ...
```
````

You review it and press Enter yourself. SelectBeam never submits for you.

Repo: https://github.com/NoahMenezes/SelectBeam

## Install (VS Code, VSCodium, Cursor, Windsurf, Antigravity…)

Same code, same `.vsix` — SelectBeam uses only stable VS Code APIs, so one
build runs on every VS Code-compatible editor.

| Editor | How to install |
|---|---|
| **VS Code** | Extensions view (`Ctrl+Shift+X`) → search `SelectBeam`, or `vsce publish` listing. |
| **VSCodium** | Extensions view → search `SelectBeam` on **Open VSX** (`open-vsx.org`). VSCodium can't use Microsoft's gallery, so Open VSX is its native source. |
| **Cursor** | Extensions view usually syncs the VS Marketplace listing — search `SelectBeam`. If a version lags, `Ctrl+Shift+P` → `Extensions: Install from VSIX…` with the `.vsix` from GitHub Releases. |
| **Windsurf** | Same as Cursor: gallery search first, else `Install from VSIX…`. CLI: `windsurf --install-extension selectbeam-*.vsix`. |
| **Antigravity** | `...` menu in Extensions view → `Install from VSIX…`, or CLI: `antigravity --install-extension selectbeam-*.vsix`. Open VSX search also works. |
| **Theia / Gitpod / Eclipse / Positron** | Native Open VSX gallery — search `SelectBeam`. |
| **Devin** | Not a marketplace editor — it works inside your repo. Run `code --install-extension selectbeam-*.vsix` in its environment, or add the `.vsix` to your devcontainer setup. |

Maintainer notes (publishing both galleries):

```bash
vsce publish   # VS Code Marketplace (covers VS Code + Cursor/Windsurf gallery sync)
ovsx publish   # Open VSX (covers VSCodium, Theia, Gitpod, Antigravity-via-OpenVSX)
```

First Open VSX release needs a one-time namespace claim
(`ovsx create-namespace NoahMenezes`) plus `OVSX_PAT` from
`open-vsx.org`. After that, pushing a `v*` tag runs
`.github/workflows/publish.yml`, which publishes to **both** galleries and
attaches the `.vsix` to the GitHub Release for manual installs.
Not supported: Zed, Sublime, Neovim — different extension systems, not VSIX.

## Status

- **VS Code extension:** v0.0.5, VS Code 1.85+. Terminal AI, browser AI, clipboard — all working.
- **Edge Add-ons:** SelectBeam Bridge 0.0.4 submitted, **in review** (~7 business days).
- **Firefox AMO:** SelectBeam Bridge 0.0.4 submitted, **awaiting review** (~3 days–3 weeks).
- **Brave:** working via unpacked `selectbeam-bridge-brave-0.0.4.zip` (Brave-gated auto-paste fix included).
- **Chrome Web Store:** listing prepped (`browser/CWS-LISTING.md`), on hold — one listing will cover Brave + Chrome + Opera + Vivaldi + Arc.
- **Next up:** Safari (needs Xcode + Mac), Opera Add-ons.

## What you need

1. **VS Code 1.85 or newer.**
2. One of these:
   - **Terminal way:** OpenCode, Claude Code, Codex CLI, Copilot CLI, aider, Gemini CLI, Qwen Code, Cursor agent, Amp, Anti-Gravity, Crush, or Goose. Different binary name? Map it in `selectbeam.agentCommands`, e.g. `{ "copilot": "gh copilot" }`.
   - **Browser way:** ChatGPT, Claude, Gemini, DeepSeek, Grok, or Copilot — SelectBeam opens it for you.
   - **Browser way with tab reuse (recommended):** the free `browser/` companion (below). Repeat sends refill the SAME chat tab.

No account, no API key. Install and use.

## How to use

1. **Highlight code** in any file.
2. **Send it:** `Ctrl+Alt+A` (`Cmd+Alt+A` on Mac), or palette (`Ctrl+Shift+P`, type `SelectBeam`), or right-click.
3. **Answer one question if asked** (pick terminal AI / browser AI / clipboard; SelectBeam asks before using an unknown terminal).
4. **Check and submit yourself.** Terminal: code waits in the AI prompt. Browser without companion: one `Ctrl+V`. Browser with companion: auto-fills in ~2s.

First send to a new AI picks the browser app (Firefox, Edge, Chrome, Brave…), opens its chat, auto-fills on load. Later sends offer **Existing tab** or **New tab**. Set `selectbeam.systemBrowser: last` to skip the app picker.

## Mac keys

| Windows / Linux | Mac |
|---|---|
| `Ctrl+Alt+A` | `Cmd+Alt+A` |
| `Ctrl+V` | `Cmd+V` |
| `Ctrl+Shift+P` | `Cmd+Shift+P` |
| `Ctrl+,` | `Cmd+,` |

If the shortcut does nothing, rebind it under File → Preferences → Keyboard Shortcuts (macOS sometimes reserves `Cmd+Alt` combos).

## Commands

| Command | What it does |
|---|---|
| SelectBeam: Send Selection to AI | Sends to a terminal AI (or pick a browser AI from the same list). Shortcut + right-click. |
| SelectBeam: Send Selection to Browser AI | Always lets you pick the AI (and remembers it). |
| SelectBeam: Choose Send Target | Reset to Auto, clipboard-only for this session, or pin one terminal. Auto clears all saved picks, live tabs, and queue. |
| SelectBeam: Show Browser Bridge Status | Bridge port, linked tabs, queued items. |

## Settings

Search `SelectBeam` in Settings (`Ctrl+,`). Defaults work for most people.

| Setting | Default | Meaning |
|---|---|---|
| `selectbeam.defaultTarget` | `"auto"` | `"auto"` = terminal first, clipboard fallback. `"clipboard"` = always copy. `"terminal"` = always terminal. |
| `selectbeam.rememberTerminalChoice` | `true` | Ask once, not every time. |
| `selectbeam.askForPrompt` | `true` | Ask for a note after code (`explain this`). Empty = code only. |
| `selectbeam.agentStartDelayMs` | `2000` | Wait after starting an AI tool before pasting (ms). |
| `selectbeam.agentCommands` | `{}` | Override tool binaries, e.g. `{ "copilot": "gh copilot" }`. |
| `selectbeam.defaultBrowser` | `"last"` | Ask once, then automatic. `"ask"` = every time, or fix one AI. |
| `selectbeam.rememberBrowserChoice` | `true` | Remembers browser pick for `"last"`. |
| `selectbeam.systemBrowser` | `"ask"` | Which app opens the chat: `"ask"`, `"last"`, `"system"`, `"firefox"`, `"edge"`, `"chrome"`, `"chromium"`, `"brave"`. |
| `selectbeam.rememberSystemBrowserChoice` | `true` | Remembers app pick for `"last"`. |
| `selectbeam.browserUrls` | `{}` | Override chat URLs, e.g. `{ "deepseek": "https://chat.deepseek.com/" }`. |
| `selectbeam.reuseBrowserTab` | `true` | Reuse the linked tab. Needs the companion. |
| `selectbeam.liveTabTTLMinutes` | `60` | Outer bound for linked-tab freshness (tabs also heartbeat every 15s; stale tabs open fresh). |
| `selectbeam.bridgeEnabled` | `true` | Run the localhost bridge. Off = copy+open only. |
| `selectbeam.bridgePort` | `51337` | Change only if taken. |

## Browser companion

Vanilla MV3, no build, no `npm install`. Works with all 6 AIs the same way. No token, no pairing — chat tabs link themselves on load.

> Publisher TODO: replace the two `REPLACE-ME` links with real store URLs once Edge/AMO approve, then republish the VSIX.

| Browser | Recommended | Fallback |
|---|---|---|
| **Edge** | [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/REPLACE-ME-WITH-YOUR-EDGE-LISTING-ID) (in review) | `edge://extensions` → Developer mode → Load unpacked → `browser/` |
| **Firefox, Zen, LibreWolf…** | [Firefox AMO](https://addons.mozilla.org/firefox/addon/REPLACE-ME-WITH-YOUR-AMO-SLUG/) (awaiting review) | `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → `browser/manifest.json` |
| **Brave** | Unzip `selectbeam-bridge-brave-0.0.4.zip` → `brave://extensions` → Developer mode → Load unpacked (CWS listing later covers it) | `browser/` folder directly |
| **Chrome, Opera, Vivaldi, Arc** | CWS listing (prepped, on hold) | Same unpacked flow (`chrome://extensions`, `opera://extensions`, …). Opera also accepts CWS via “Install Chrome Extensions”. |

Chromium unpacked loads use `browser/manifest.chrome.json` as `browser/manifest.json` (background key differs); Firefox uses `manifest.firefox.json`. Brave: Shields down for the chat site if fills miss; log in first (logged-out landings reject fill). **Safari:** later — needs an Xcode wrapper + Mac.

Bridge: `http://127.0.0.1:51337` only, extension-origin check, no password. One VS Code window owns it; a second falls back to copy+open.

## If something goes wrong

- **Shortcut does nothing:** highlight code first; else rebind in Keyboard Shortcuts.
- **New tab every time:** no tab linked — companion unloaded (re-load Firefox temporary add-on; Chromium unpacked persists) or chat closed. Check Bridge Status.
- **Badge “bridge off?”:** VS Code closed, `bridgeEnabled` off, or wrong port. Click badge to retry.
- **Chat box empty:** wait ~30s (Brave ~60s) for editor load; code is also in clipboard (`Ctrl+V`). Persistent failure = site redesign → `SELECTORS` table in `browser/content.js`.
- **Terminal shows `bquote>`:** code landed in a plain shell — `Ctrl+C`, then run your AI tool there first.

## Building from source

Offline-safe, `node_modules` vendored:

```bash
bun run check-types  # type-check
bun run compile      # one-off build
bun run watch        # rebuild on save (used by F5)
bun run package      # minified production build
```

Press **F5** for the Extension Development Host. VS Code side is `src/` (see `docs/CODE-NOTES.md` for the module map — source files are comment-free by design). Browser side is `browser/`.
