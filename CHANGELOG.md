# Changelog

All notable changes to CodeBeam will be documented here.

## [0.0.2] — 2026-09-14

- New `codebeam.sendToBrowser` command: copy selection + open ChatGPT / Claude / Gemini / DeepSeek in the browser (paste once with Ctrl+V — VS Code cannot type into external tabs)
- `sendSelection` picker now also offers the 4 browser AIs alongside terminal agents
- New settings: `codebeam.defaultBrowser` (`ask`/`last`/specific), `codebeam.rememberBrowserChoice`, `codebeam.browserUrls` overrides
- `Choose Send Target → Auto` also clears last-browser memory

## [0.0.1] — 2026-09-14

- Initial V1: `codebeam.sendSelection` command
- Formats selection as markdown code block with `// path (lines X-Y)` header
- Copies to clipboard + 2s status-bar confirmation
- Keybinding `Ctrl+Alt+A` / `Cmd+Alt+A` + editor right-click menu
