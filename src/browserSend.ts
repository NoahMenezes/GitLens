// SelectBeam — browser send path: one-tap, same-tab, every provider.
// Clipboard is ALWAYS written first so nothing is ever lost. Every send is
// ALSO queued on the bridge, so even a first-ever send to a new AI
// auto-fills when its chat loads. SelectBeam never auto-submits.

import * as vscode from "vscode";
import { BROWSERS, findBrowser } from "./constants";
import {
  getBrowserUrl,
  getDefaultBrowser,
  getRememberBrowserChoice,
  getReuseBrowserTab,
} from "./config";
import { pasteHint } from "./platform";
import {
  buildPayload,
  copyToClipboard,
} from "./payload";
import {
  ageLabel,
  getLastBrowserId,
  getLiveTab,
  setLastBrowserId,
  setLiveTab,
} from "./state";
import { isBridgeOwner, queuePasteForBrowser, showBridgeStatus } from "./bridge";
import type { BrowserDef } from "./types";

// `selectbeam.sendToBrowser` (palette): ALWAYS shows the picker so switching
// models is one command away. The pick updates "last". Pass forceAsk=false
// only from automatic flows (there are none right now — the shortcut goes
// through sendSelection, which reaches here via the no-terminal picker;
// "last" default keeps that to a single first-time question).
export async function sendToBrowser(
  context: vscode.ExtensionContext,
  forceAsk = true
): Promise<void> {
  const editor: vscode.TextEditor | undefined =
    vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showWarningMessage("SelectBeam: No active editor.");
    return;
  }
  if (editor.selection.isEmpty) {
    void vscode.window.showWarningMessage(
      "SelectBeam: Select some code first."
    );
    return;
  }

  const { payload, relativePath, startLine, endLine } =
    buildPayload(editor);

  const browser: BrowserDef | "clipboard" | undefined =
    await resolveBrowser(context, forceAsk);
  if (!browser) {
    return; // Esc
  }
  if (browser === "clipboard") {
    await copyToClipboard(
      payload,
      `$(clippy) SelectBeam: copied ${relativePath} (lines ${startLine}-${endLine})`
    );
    return;
  }
  await sendToBrowserTarget(
    context, browser, payload, relativePath, startLine, endLine
  );
}

// Resolve which browser AI to use. forceAsk=true (palette) always shows the
// picker. Otherwise: fixed default -> use it; "last" -> remembered pick (or
// picker on fresh installs); "ask" -> picker with clipboard fallback.
async function resolveBrowser(
  context: vscode.ExtensionContext,
  forceAsk = false
): Promise<BrowserDef | "clipboard" | undefined> {
  const defaultBrowser = forceAsk ? "ask" : getDefaultBrowser();

  if (defaultBrowser !== "ask" && defaultBrowser !== "last") {
    const fixed = findBrowser(defaultBrowser);
    if (fixed) {
      return fixed;
    }
    // Unknown id (e.g. after an update) — fall through to the picker.
  }

  if (defaultBrowser === "last") {
    const lastId = getLastBrowserId(context);
    if (lastId) {
      const last = findBrowser(lastId);
      if (last) {
        return last;
      }
    }
  }

  interface BrowserPick extends vscode.QuickPickItem {
    pickKind: "browser" | "clipboard";
    browser?: BrowserDef;
  }
  const lastId = getLastBrowserId(context);
  const items: BrowserPick[] = [
    ...BROWSERS.map(
      (b: BrowserDef): BrowserPick => ({
        label: b.id === lastId ? `${b.label} $(history)` : b.label,
        description: b.id === lastId ? `Last used — ${b.description}` : b.description,
        pickKind: "browser",
        browser: b,
      })
    ),
    {
      label: "$(clippy) Clipboard only",
      description: "Just copy, don't open a browser",
      pickKind: "clipboard",
    },
  ];
  const picked: BrowserPick | undefined =
    await vscode.window.showQuickPick<BrowserPick>(items, {
      placeHolder: `SelectBeam: pick a browser AI (remembered after this — paste once with ${pasteHint()} only if the companion is missing)`,
    });
  if (!picked) {
    return undefined;
  }
  if (picked.pickKind === "clipboard") {
    return "clipboard";
  }
  await rememberBrowser(context, picked.browser!.id);
  return picked.browser!;
}

async function rememberBrowser(
  context: vscode.ExtensionContext,
  browserId: string
): Promise<void> {
  if (getRememberBrowserChoice()) {
    await setLastBrowserId(context, browserId);
  }
}

export async function sendToBrowserTarget(
  context: vscode.ExtensionContext,
  browser: BrowserDef,
  payload: string,
  relativePath: string,
  startLine: number,
  endLine: number
): Promise<void> {
  await rememberBrowser(context, browser.id);
  // One-tap: browser sends never ask for an instruction note (the terminal
  // path still honors `selectbeam.askForPrompt`). Code goes as-is.
  const finalText: string = payload;
  const fileRef = `${relativePath} (lines ${startLine}-${endLine})`;

  await vscode.env.clipboard.writeText(finalText);

  // ALWAYS queue when we own the bridge — even with no live tab yet. The
  // companion claims it on first poll, so first-ever sends auto-fill too.
  const canQueue = isBridgeOwner() && getReuseBrowserTab();
  if (canQueue) {
    queuePasteForBrowser(browser.id, finalText, fileRef);
  }

  // 1) Fresh live tab -> same-tab reuse, no new tab. Quiet on purpose:
  // the fill confirmation from the tab itself pops the message in VS Code.
  const live = getLiveTab(context, browser.id);
  if (live && canQueue) {
    vscode.window.setStatusBarMessage(
      `$(globe) SelectBeam: sent ${fileRef} to ${browser.id} tab "${live.title || live.url}" (${ageLabel(live.updatedAt)}) — filling…`,
      5000
    );
    return;
  }

  // 2) No live tab (or bridge off): open the chat. If queued above, the new
  // tab auto-fills when its editor loads — no manual paste needed.
  await setLiveTab(context, browser.id, getBrowserUrl(browser), "", true);
  const url: string = getBrowserUrl(browser);
  try {
    const uri: vscode.Uri = vscode.Uri.parse(url);
    const opened: boolean = await vscode.env.openExternal(uri);
    if (opened) {
      const hint = canQueue
        ? `Opening ${browser.id} — code fills itself when the chat loads.`
        : `Bridge is ${isBridgeOwner() ? "off" : "owned by another window"} — opened ${browser.id} normally. Press ${pasteHint()} there.`;
      void vscode.window.showInformationMessage(
        `SelectBeam: ${fileRef} copied — ${hint}`,
        "Copy again",
        "Bridge status"
      ).then(async (action: string | undefined): Promise<void> => {
        if (action === "Copy again") {
          await vscode.env.clipboard.writeText(finalText);
        } else if (action === "Bridge status") {
          await showBridgeStatus(context);
        }
      });
      vscode.window.setStatusBarMessage(
        `$(globe) SelectBeam: opened ${browser.id} — ${canQueue ? "auto-fill queued" : `code is in your clipboard, press ${pasteHint()} there`}`,
        5000
      );
    } else {
      vscode.window.setStatusBarMessage(
        "$(clippy) SelectBeam: browser would not open — code copied to clipboard instead",
        3000
      );
    }
  } catch {
    vscode.window.setStatusBarMessage(
      "$(clippy) SelectBeam: could not open browser — code copied to clipboard instead",
      3000
    );
  }
}
