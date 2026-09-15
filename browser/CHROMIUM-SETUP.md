# SelectBeam browser companion — Chromium setup (printable, offline)

Chrome, Edge, Brave, Opera, Vivaldi, Arc. No token, no pairing, nothing to type.

## Recommended: store install (auto-updates, survives restarts)

- **Edge → Edge Add-ons** (1 click): install link is in the VS Code
  extension Details page (README → Browser companion table).
  Then open your chats and send from VS Code — done.
- **Chrome / Brave / Opera / Vivaldi / Arc → Chrome Web Store:**
  one CWS listing covers ALL of these. Publish once, install everywhere.
  The Edge Add-ons listing does NOT install in Brave/Chrome — you need
  the CWS listing (or the unpacked fallback below) for those.

## Fallback: Load unpacked (no store needed, works today in all of them)

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

## Brave notes

- **Brave zip (easiest):** `selectbeam-bridge-brave-0.0.4.zip` (repo root,
  rebuilt with the Brave paste fix) → unzip → `brave://extensions` →
  Developer mode → Load unpacked → the unzipped folder. Or load the
  `browser/` folder directly — same files. Rebuild anytime with
  `bash browser/build-brave-zip.sh` (offline, no deps).
- If fills ever miss: click Shields (lion icon) → Shields down for the
  chat site (chatgpt.com, claude.ai, etc.), reload the tab, send again.
  Shields can block the localhost bridge (`127.0.0.1:51337`) heartbeat.
  Log in to the chat site first — logged-out landing pages use a
  different input that rejects programmatic fill.
- `brave://extensions` → pin SelectBeam Bridge so you can see the
  green “linked ✓” badge. Click the badge to retry a fill.

## Opera / Vivaldi / Arc notes

- Vivaldi, Arc: Chrome Web Store installs directly, no extra step.
- Opera: enable “Install Chrome Extensions” from Opera Add-ons once,
  then the CWS listing installs normally. Unpacked load always works.

Troubleshoot: badge says bridge off = VS Code closed or wrong port (`51337`).
Brave: if fills ever miss, try Shields down for the chat site, then report it.
