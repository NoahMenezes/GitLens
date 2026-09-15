# Chrome Web Store listing — SelectBeam Bridge (covers Brave + Chrome + Opera + Vivaldi + Arc)
# Brave has NO extension store of its own. Publish here once; Brave installs from the CWS link directly.
# Upload file: selectbeam-bridge-chrome-0.0.4.zip (repo root, rebuilt with the Brave paste fix)
# Console: https://chrome.google.com/webstore/devconsole ($5 one-time dev fee)

## Listing fields (copy-paste)

Name: SelectBeam Bridge

Category: Productivity

Language: English (United States)

Short description (max 132 chars):
Reuses your linked AI chat tab for SelectBeam sends — same tab every time. Localhost only, no cloud.

Detailed description:
SelectBeam Bridge is the free browser companion for the SelectBeam VS Code extension.

Highlight code in VS Code, press Ctrl+Alt+A, and your code auto-fills into the SAME
AI chat tab every time — no new-tab spam, no copy-paste. Works with ChatGPT, Claude,
Gemini, DeepSeek, Grok, and Microsoft Copilot.

- Zero setup: no account, no API key, no token to copy. Chat tabs link themselves.
- Paste, never send: the extension only fills the chat box. You review and submit yourself.
- Private by design: talks only to SelectBeam on your own machine (http://127.0.0.1).
  No data leaves your computer, nothing is collected, no remote code.

Requires the SelectBeam extension for VS Code to send code. Without it, tabs simply
show a "linked" badge and wait.

## Privacy tab (declare honestly — this is where rejections happen)

- Data collection: NONE. No user data collected, transmitted, or sold.
- Remote code: NONE. All logic is bundled in the uploaded zip, plain readable JS.
- storage permission: remembers the local bridge port setting on your machine.
- tabs permission: detects when a linked chat tab is closed, so the next send
  opens a fresh chat instead of reusing a dead tab.
- Host permissions: the 6 supported AI chat sites (to fill the visible chat box)
  plus http://127.0.0.1/* (local bridge to VS Code on your own machine).

## Assets needed before submitting

- Icon: browser/icon.png is already 128x128 — OK.
- Screenshots: at least 1 REQUIRED, 1280x800 or 640x480. Suggested shot: a chat
  tab with pasted code in the box + the green "SelectBeam linked" badge visible.
- Promo tiles: small (440x280) optional but recommended for discovery.

## After approval

- You get one CWS link: https://chrome.google.com/webstore/detail/<your-id>
- Brave users install from that link directly (Brave opens CWS natively).
- Put that link in README.md (Browser companion table) + walkthroughs/step-companion.md,
  rebuild the VSIX, republish the VS Code extension so the Details page shows 1-click install.
- Future updates: bump "version" in browser/manifest.brave.json +
  browser/manifest.chrome.json (+ manifest.json), rebuild zips, re-upload. CWS update
  reviews are fast (usually hours). Do NOT touch Edge/AMO listings mid-review.
