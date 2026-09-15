# Link your browser (once)

No token, no account, nothing to type. Store install is best (auto-updates):

- **Edge:** install from Edge Add-ons (link in Details section), then just keep a chat tab open.
- **Firefox / Zen / LibreWolf:** install from Firefox AMO (link in Details section), then just keep a chat tab open.
- **Brave / Chrome / Opera / Vivaldi / Arc:** use the Chrome Web Store listing once published (one listing covers all of them). Until then: copy `browser/manifest.chrome.json` over `browser/manifest.json`, then your browser's extensions page → Developer mode → Load unpacked → `browser/`.

Fallback without stores:
- **Firefox family:** `about:debugging` → Load Temporary Add-on → `browser/manifest.json`.
- **Chromium family:** your browser's extensions page → Developer mode → Load unpacked → `browser/`.

Then open your AI chat in a tab and keep it open. That is the whole setup —
every supported chat tab links itself automatically.
