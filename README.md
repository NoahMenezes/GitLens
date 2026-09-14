# CodeBeam

> Beam your code straight to AI — no copy-paste, no tab-switching.

![demo placeholder](https://via.placeholder.com/800x450?text=CodeBeam+demo+GIF+coming+soon)

<!-- Replace the image above with a real screen recording (e.g. Peek on Linux,
     then export as GIF) showing: select code -> Ctrl+Alt+Shift+A -> paste into AI. -->

## Install

### From source (dev)

```bash
cd codebeam
bun install
bun run compile
```

Then press **F5** in VS Code to launch the Extension Development Host.

### From `.vsix` (packaged)

```bash
cd codebeam
bun run package
vsce package
code --install-extension codebeam-0.0.1.vsix
```

> Before publishing, set the `publisher` field in `package.json` to your
> [Visual Studio Marketplace publisher name](https://marketplace.visualstudio.com/manage).

## Usage

1. Select some code in any editor.
2. Trigger **CodeBeam: Send Selection to AI** via any of:
   - Command Palette (`Ctrl/Cmd+Shift+P` -> type "CodeBeam")
   - Keyboard shortcut `Ctrl+Alt+Shift+A` (Linux/Windows) / `Cmd+Alt+Shift+A` (macOS)
   - Right-click -> **CodeBeam: Send Selection to AI** (only shows with a selection)
3. If a terminal is open (e.g. running Claude Code, Copilot CLI, Codex,
   OpenCode, aider), the snippet is typed into it for review — press Enter
   there to submit. Otherwise it is copied to the clipboard for pasting.

## How it works

Terminal-first, clipboard-fallback:

- **Terminal open → send to terminal.** The formatted block is sent via
  `terminal.sendText(block, false)` — the `false` means CodeBeam does NOT
  press Enter for you. You review the prompt in your AI CLI and submit it
  yourself. The terminal is shown (`terminal.show()`) and the status bar
  confirms: `$(terminal) Sent to terminal`.
- **No terminal open → clipboard fallback.** The same block is copied via
  `vscode.env.clipboard.writeText()` and the status bar says
  `$(clippy) Copied — no terminal open`.
- **Multiple terminals → quickpick.** When `vscode.window.terminals`
  has more than one entry, you pick the target by terminal name. The pick
  is remembered for the session (see `rememberTerminalChoice` below) so
  you are only asked once.
- **Send failure → clipboard.** If `sendText` throws, CodeBeam copies to
  the clipboard instead and tells you in the status bar, so no snippet is
  ever lost.

To manually re-pick at any time, run **CodeBeam: Choose Send Target** from
the Command Palette: choose Auto (reset), Clipboard only (this session),
or a specific terminal by name.

## Settings

- `codebeam.defaultTarget` (`"auto"` | `"clipboard"` | `"terminal"`,
  default `"auto"`):
  - `"auto"` — try the terminal first, fall back to the clipboard.
  - `"clipboard"` — always copy, even when terminals are open.
  - `"terminal"` — always require a terminal; shows an error if none exists.
- `codebeam.rememberTerminalChoice` (boolean, default `true`): after a
  quickpick terminal selection, remember that terminal (in extension
  `workspaceState`) for the rest of the session so you aren't prompted
  every time. Set to `false` to be asked on every send with 2+ terminals.

> Scope note: Currently supports terminal-based AI tools (Claude Code,
> Copilot CLI, Codex, OpenCode, aider, etc, or any tool running in your VS
> Code terminal). Browser-based AI chats (ChatGPT, Claude.ai, Gemini) are
> not yet supported — planned as a separate companion extension.

What gets copied looks like this:

````markdown
```typescript
// src/extension.ts (lines 12-24)
const x = 42;
console.log(x);
```
````

The `// path (lines X-Y)` header tells the AI exactly where the snippet came
from, and the language fence preserves syntax highlighting.

## Why CodeBeam?

Copy-pasting code into AI tools is small friction repeated 50x a day: select,
copy, switch tab, type a filename for context, paste, switch back. CodeBeam
removes the manual context-adding step — the file path, line range, and
language tag travel with the snippet automatically. V1 just uses the clipboard
(the universal API every AI tool already supports); later versions will
auto-inject into an active terminal running Claude Code / aider and keep a
send-history sidebar.

## Dev

```bash
bun install     # install deps (never npm/yarn — this repo uses Bun)
bun run watch   # esbuild watch mode (re-bundles on save)
```

Then **F5** to debug. See `src/extension.ts` — it's heavily commented for
learning the VS Code API.

## Roadmap

- [x] V1: format selection as markdown + copy to clipboard + status-bar confirm
- [x] V2: auto-type/paste into active terminal running an AI CLI (terminal-first, clipboard fallback + choose-target command)
- [ ] V3: sidebar webview with send history
