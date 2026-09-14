# SelectBeam browser companion — Firefox setup (printable, offline)

1. VS Code: `Ctrl+Shift+P` (`Cmd+Shift+P` on Mac) → 
   **SelectBeam: Show Browser Bridge Status** → token auto-copied.
2. Firefox: open `about:debugging#/runtime/this-firefox`.
3. **Load Temporary Add-on** → pick `browser/manifest.json`.
4. Open chat (`https://chatgpt.com/` etc.) → click SelectBeam Bridge icon.
5. Paste token, port `51337` → **Save** → **Link this tab** → “Linked!”.
6. VS Code: select code → `Ctrl+Alt+A` (`Cmd+Alt+A` Mac) → same provider.
   SAME tab auto-fills in ~2s. No new tab.
7. Not linked / closed / expired → new chat opens. Link it once, reuse after.

Troubleshoot: “Bridge unreachable” = VS Code closed or wrong port.
“Bad token” = re-run Show Bridge Status, paste fresh, Save + Link.
Temporary add-ons unload on Firefox restart — reload manifest (10s).
