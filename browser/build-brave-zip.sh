#!/usr/bin/env bash
# SelectBeam Bridge — Brave zip builder (offline-safe, no deps).
# Brave is Chromium: manifest.brave.json is the service_worker build.
# Packs the CURRENT browser/ sources (with the Brave-gated paste fix)
# into selectbeam-bridge-brave-<version>.zip at the repo root.
# Usage: bash browser/build-brave-zip.sh   (run from repo root)
set -euo pipefail
MANIFEST="browser/manifest.brave.json"
VER="$(grep -m1 '"version"' "$MANIFEST" | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"
OUT="selectbeam-bridge-brave-${VER}.zip"
rm -f "$OUT"
TMP="$(mktemp -d)"
cp browser/background.js browser/content.js browser/popup.html browser/popup.js browser/icon.png "$TMP/"
cp "$MANIFEST" "$TMP/manifest.json"
(cd "$TMP" && zip -q -9 "$OLDPWD/$OUT" manifest.json background.js content.js popup.html popup.js icon.png)
rm -rf "$TMP"
echo "Built $OUT"
unzip -l "$OUT"
