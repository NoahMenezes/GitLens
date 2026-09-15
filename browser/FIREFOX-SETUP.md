# SelectBeam browser companion — Firefox setup (printable, offline)

No token, no pairing, nothing to type.

## Recommended: store install (persists across restarts)

Install from **Firefox AMO** — link is in the VS Code extension Details
page (README → Browser companion table). Then open your chats, keep them
open, send from VS Code — tabs self-link. Works in Firefox, Dev Edition,
Zen, LibreWolf, Waterfox, Floorp (same listing, same build).

## Fallback: temporary load (no store needed)

1. Firefox: open `about:debugging#/runtime/this-firefox`.
2. **Load Temporary Add-on** → pick `browser/manifest.json`
   (or `browser/manifest.firefox.json` — same content, Firefox `scripts`
   background key).
3. Open your chats (ChatGPT, Claude, Gemini, DeepSeek, Grok, Copilot).
4. VS Code: select code → `Ctrl+Alt+A` (`Cmd+Alt+A` Mac) → pick an AI once.
   SAME tab auto-fills in ~2s. No new tab. Every send after is one-tap.
5. First send to a new AI opens its chat and auto-fills when it loads.
   Switch AI anytime via palette → **SelectBeam: Send Selection to Browser AI**.

Troubleshoot: badge says bridge off = VS Code closed or wrong port (`51337`).
Temporary add-ons unload on Firefox restart — reload manifest (10s).
Store installs do NOT unload — prefer AMO for daily use.
