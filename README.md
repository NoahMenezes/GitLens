# SelectBeam

> Highlight code, press one shortcut, and your code is ready for AI. No copy-paste.

SelectBeam takes the code you selected and hands it to an AI for you, along
with the file name and line numbers so the AI knows where it came from.

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

No account, no API key, no setup. Install the extension and use it.

## How to use

**1. Highlight some code** in any file.

**2. Send it.** Any of these work:

- Press `Ctrl+Alt+Shift+A` on Windows/Linux
  (`Cmd+Alt+Shift+A` on Mac).
- Or press `Ctrl+Shift+P` (`Cmd+Shift+P` on Mac), type `SelectBeam`,
  and pick a command.
- Or right-click the highlighted code and pick a SelectBeam command.

The shortcut only works when text is highlighted.

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
- Browser: your code is copied and the chat site opens. Press `Ctrl+V`
  once (`Cmd+V` on Mac) in the chat box. That one paste is required —
  VS Code is not allowed to type into your browser for you.

## The three commands

| Command | How to reach it | What it does |
|---|---|---|
| SelectBeam: Send Selection to AI | Shortcut, right-click, or palette | Sends your selection to a terminal AI. If you prefer, you can also pick a browser AI from the same list. |
| SelectBeam: Send Selection to Browser AI (ChatGPT / Claude / Gemini / DeepSeek) | Palette or right-click | Copies your selection and opens the chat site you pick. Paste once with `Ctrl+V`. |
| SelectBeam: Choose Send Target | Palette only | Changes where future sends go: back to Auto, clipboard only for this session, or one fixed terminal. |

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
| `selectbeam.defaultBrowser` | `"ask"` | Which browser AI to open. `"ask"` asks every time. `"last"` reuses your last pick. Or set one: `"chatgpt"`, `"claude"`, `"gemini"`, `"deepseek"`. |
| `selectbeam.rememberBrowserChoice` | `true` | Remembers your browser pick so `"last"` works. |
| `selectbeam.browserUrls` | `{}` | If a chat site address changes, write it here. Example: `{ "deepseek": "https://chat.deepseek.com/" }`. |

To reset everything, run **SelectBeam: Choose Send Target** and pick
**Auto**. That clears the saved terminal, the saved browser, and the
clipboard-only mode.

## Two things to know

1. **SelectBeam never presses Enter for you.** Your code waits in the
   AI tool until you submit it. This is on purpose so you can check it first.
2. **The browser way always needs one paste.** SelectBeam copies and opens
   the site, you press `Ctrl+V` once. If the copy is lost, use the
   “Copy again” button in the notification.

## If something goes wrong

**Nothing happens when I press the shortcut.**
Highlight code first. The shortcut only works with an active selection.
If it still does nothing, another extension may use the same keys —
change it under File → Preferences → Keyboard Shortcuts, search
“SelectBeam”.

**The browser opened but the chat box is empty.**
Press `Ctrl+V` (`Cmd+V` on Mac) once in the chat box. Your code is in
the clipboard. If needed, press “Copy again” in the VS Code notification.

**My terminal shows `bquote>` lines.**
That means code was put into a plain shell instead of an AI tool.
Press `Ctrl+C` to get your prompt back, then make sure your AI tool
(`opencode`, `claude`, and so on) is actually running in that terminal
before sending again. Current SelectBeam asks before using an unknown
terminal, so this should be rare.

## Building from source (developers only)

Normal use does not need any of this. Only for working on the extension
itself:

```bash
bun install     # install dependencies
bun run compile # one-off build
bun run watch   # rebuild on every save (used by F5)
bun run check-types  # type-check only
bun run package # minified production build
```

Then press **F5** in VS Code to open the Extension Development Host.
Source is one file: `src/extension.ts`.
