# SelectBeam browser companion — Firefox setup (printable, offline)

No token, no pairing, nothing to type.

1. Firefox: open `about:debugging#/runtime/this-firefox`.
2. **Load Temporary Add-on** → pick `browser/manifest.json`.
3. Open your chats (ChatGPT, Claude, Gemini, DeepSeek, Grok, Copilot).
4. VS Code: select code → `Ctrl+Alt+A` (`Cmd+Alt+A` Mac) → pick an AI once.
   SAME tab auto-fills in ~2s. No new tab. Every send after is one-tap.
5. First send to a new AI opens its chat and auto-fills when it loads.
   Switch AI anytime via palette → **SelectBeam: Send Selection to Browser AI**.

Troubleshoot: badge says bridge off = VS Code closed or wrong port (`51337`).
Temporary add-ons unload on Firefox restart — reload manifest (10s).
