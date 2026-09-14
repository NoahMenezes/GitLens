# SelectBeam browser companion — Chromium setup (printable, offline)

Chrome, Edge, Brave, Opera, Vivaldi, Arc. No token, no pairing, nothing to type.

1. Copy `browser/manifest.chrome.json` over `browser/manifest.json`
   (only the `background` key differs — back it up first if you also use Firefox).
2. Open your browser's extensions page and enable **Developer mode**:

   - Chrome → `chrome://extensions`
   - Edge → `edge://extensions`
   - Brave → `brave://extensions`
   - Opera / GX → `opera://extensions`
   - Vivaldi → `vivaldi://extensions`
   - Arc → `arc://extensions`
3. **Load unpacked** → pick the `browser/` folder. Unlike Firefox,
   unpacked installs survive browser restarts.
4. Open your chats (ChatGPT, Claude, Gemini, DeepSeek, Grok, Copilot).
5. VS Code: select code → `Ctrl+Alt+A` (`Cmd+Alt+A` Mac) → pick an AI once.
   SAME tab auto-fills in ~2s. Second send onwards: **Last used tab** or **New chat**.
6. First send to a new AI opens its chat and auto-fills when it loads.

Troubleshoot: badge says bridge off = VS Code closed or wrong port (`51337`).
Brave: if fills ever miss, try Shields down for the chat site, then report it.
