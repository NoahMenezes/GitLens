# Changelog

All changes to SelectBeam will be listed here.

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
