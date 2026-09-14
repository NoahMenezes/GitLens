# Link your browser (once)

No token, no account, nothing to type:

- **Firefox family:** `about:debugging` → Load Temporary Add-on →
  `browser/manifest.json`.
- **Chrome, Edge, Brave, Opera, Vivaldi, Arc:** copy
  `browser/manifest.chrome.json` over `browser/manifest.json`, then your
  browser's extensions page → Developer mode → Load unpacked → `browser/`.

Then open your AI chat in a tab and keep it open. That is the whole setup —
every supported chat tab links itself automatically.
