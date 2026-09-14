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
3. Paste (`Ctrl/Cmd+V`) into ChatGPT, Claude, Copilot Chat, etc.

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
- [ ] V2: auto-type/paste into active terminal running an AI CLI
- [ ] V3: sidebar webview with send history
