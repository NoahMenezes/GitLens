# CodeBeam

> Select code → press a shortcut → it lands in your AI coding agent. No copy-paste.

CodeBeam sends your selected code (with file path + line numbers) straight
into a terminal AI tool — OpenCode, Claude Code, Codex CLI, Copilot CLI, or
aider — running inside VS Code. Nothing to configure to start.

## What you need

1. **VS Code** (1.85 or newer)
2. **Bun** — install from <https://bun.sh> (`curl -fsSL https://bun.sh/install | bash`)
3. **At least one AI CLI** installed, e.g. `opencode`, `claude`, `codex`, `copilot`, or `aider`

## Setup (3 steps)

```bash
# 1. Clone and enter the project
git clone <your-repo-url> codebeam
cd codebeam

# 2. Install dependencies (always with Bun — never npm/yarn here)
bun install

# 3. Build once
bun run compile
```

Then press **F5** in VS Code. A new window ("Extension Development Host")
opens with CodeBeam loaded. That's it.

## Daily use

1. Select some code in any file.
2. Press `Ctrl+Alt+Shift+A` (macOS: `Cmd+Alt+Shift+A`).
   Or: `Ctrl/Cmd+Shift+P` → type **CodeBeam** → pick a command.
   Or: right-click the selection → **CodeBeam: Send Selection to AI**.
3. What happens next:
   - **No terminal open** → CodeBeam asks which agent to launch
     (OpenCode, Claude Code, Codex, Copilot CLI, aider),
     opens it, and pastes your code into its prompt.
     It never presses Enter — you review and submit yourself.
   - **Terminal open, agent already running there** → code is pasted in.
   - **Terminal open, plain shell** → CodeBeam asks first
     (launch an agent / paste anyway / clipboard) instead of dumping
     raw text into your shell.
   - Optionally type an instruction ("explain this", "find the bug")
     when asked, or leave it empty for code only.
4. To change your mind anytime: command palette →
   **CodeBeam: Choose Send Target** (Auto reset / Clipboard only / terminal).

What the AI receives looks like this:

````markdown
```python
// MergeSort.py (lines 12-25)
def merge(arr, low, mid, high):
    ...
```
````

## Settings

Open VS Code Settings (`Ctrl/Cmd+,`) and search **CodeBeam**:

| Setting | Default | What it does |
|---|---|---|
| `codebeam.defaultTarget` | `"auto"` | `"auto"` = terminal first, clipboard fallback · `"clipboard"` = always copy · `"terminal"` = always use terminal |
| `codebeam.rememberTerminalChoice` | `true` | Remember your terminal pick so you're asked once, not every time |
| `codebeam.askForPrompt` | `true` | Ask for an optional instruction to send with the code |
| `codebeam.agentStartDelayMs` | `2000` | Wait after launching an agent before pasting (lets its UI start) |
| `codebeam.agentCommands` | `{}` | Override launch commands, e.g. `{ "copilot": "gh copilot" }` |
| `codebeam.defaultBrowser` | `"ask"` | Browser AI for "Send to Browser AI": `"ask"` = picker · `"last"` = reuse last pick · `"chatgpt"`/`"claude"`/`"gemini"`/`"deepseek"` = jump straight there |
| `codebeam.rememberBrowserChoice` | `true` | Remember your browser pick for `"last"` mode |
| `codebeam.browserUrls` | `{}` | Override chat URLs, e.g. `{ "deepseek": "https://chat.deepseek.com/" }` |

## Commands

| Command | Shortcut | What it does |
|---|---|---|
| CodeBeam: Send Selection to AI | `Ctrl+Alt+Shift+A` | Format + send to terminal agent (or pick a browser AI from the same picker) |
| CodeBeam: Send Selection to Browser AI (ChatGPT / Claude / Gemini / DeepSeek) | — (palette + right-click) | Copy code + open the chat site — paste once with `Ctrl+V` there |
| CodeBeam: Choose Send Target | — (palette only) | Re-pick target / reset to Auto / clipboard-only |

## Troubleshooting

**`[DEP0169] url.parse() ... Use the WHATWG URL API instead` in the Debug Console**
Harmless noise from VS Code's own extension host — not from CodeBeam
(our code never calls `url.parse()`). It changes nothing about how the
extension runs. This repo already sets `NODE_NO_WARNINGS=1` in
`.vscode/launch.json` so you won't see it when pressing F5. If you still
see it, update VS Code to the latest version; the warning comes from its
bundled Node runtime.

**Terminal fills with `bquote>` lines after sending**
You pasted a code fence into a plain shell (old behavior). Current
CodeBeam asks before pasting into an unknown terminal. If you're ever
stuck in `bquote>`, press `Ctrl+C` to get your prompt back, then make
sure your AI agent (`opencode`, `claude`, …) is actually running in that
terminal before sending.

**Nothing happens when I press the shortcut**
The shortcut only fires with an active selection (`when: editorHasSelection`).
Highlight code first. If another extension stole the keybinding, rebind it
in File → Preferences → Keyboard Shortcuts → search "CodeBeam".

**`vsce package` / install fails**
Set the `publisher` field in `package.json` to your
[Marketplace publisher name](https://marketplace.visualstudio.com/manage),
then:
```bash
bun run package
npx @vscode/vsce package
code --install-extension codebeam-0.0.1.vsix
```

**Commands not showing in a fresh clone**
You skipped the build. Run `bun install && bun run compile`, then F5.
VS Code loads the extension from `dist/extension.js`, which only exists
after a build.

## For developers

```bash
bun install     # install deps
bun run watch   # rebuild on every save (used automatically by F5)
bun run compile # one-off build
bun run check-types  # type-check only (tsc --noEmit)
bun run package # minified production build
```

Source is one file — `src/extension.ts`, heavily commented to explain each
VS Code API call. Settings live under `contributes.configuration` in
`package.json`. Package manager is Bun: use `bun add`, never npm/yarn.

> Two send paths, both free with no API keys:
> **Terminal** (Claude Code, Copilot CLI, Codex, OpenCode, aider — pasted
> directly into the CLI prompt) and **Browser** (ChatGPT, Claude, Gemini,
> DeepSeek — code is copied, the chat site opens, you press `Ctrl+V` once).
> VS Code extensions cannot type into external browser tabs, so that one
> manual paste is a platform limit, not a bug. True auto-paste would need a
> companion browser extension (possible Phase 2).

## Roadmap

- [x] Format selection as markdown + clipboard fallback
- [x] Terminal send + agent auto-launch + paste-without-submit
- [x] Browser send (ChatGPT / Claude / Gemini / DeepSeek — copy + open + paste once)
- [ ] Send-history sidebar
