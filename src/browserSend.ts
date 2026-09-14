// SelectBeam — browser send path: one-tap, same-tab, every provider.
// Clipboard is ALWAYS written first so nothing is ever lost. Every send is
// ALSO queued on the bridge, so even a first-ever send to a new AI
// auto-fills when its chat loads. First send opens a new chat; from the
// second send on you choose Last used tab vs New chat. Never auto-submits.

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
  removeLiveTab,
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

  const canQueue = isBridgeOwner() && getReuseBrowserTab();
  const live = getLiveTab(context, browser.id);

  // Second send onwards with a fresh tab: YOU choose — refill the last
  // used tab, or open a brand-new chat. First send (no live tab) always
  // opens a new chat, exactly like before.
  if (live && canQueue) {
    interface ReusePick extends vscode.QuickPickItem {
      choice: "last" | "new";
    }
    const pick: ReusePick | undefined =
      await vscode.window.showQuickPick<ReusePick>(
        [
          {
            label: "$(history) Last used tab",
            description: `"${live.title || live.url}" (${ageLabel(live.updatedAt)}) — refill it`,
            choice: "last",
          },
          {
            label: "$(plus) New chat",
            description: `Open a fresh ${browser.id} chat and fill it there`,
            choice: "new",
          },
        ],
        {
          placeHolder: `SelectBeam: refill your last ${browser.id} tab, or open a new chat?`,
        }
      );
    if (!pick) {
      return; // Esc — clipboard still has the code, nothing queued
    }
    if (pick.choice === "last") {
      queuePasteForBrowser(browser.id, finalText, fileRef);
      // Quiet on purpose: the fill confirmation from the tab itself pops
      // the message in VS Code.
      vscode.window.setStatusBarMessage(
        `$(globe) SelectBeam: sent ${fileRef} to ${browser.id} tab — filling…`,
        5000
      );
      return;
    }
    // New chat: forget the old tab so the fresh one registers itself,
    // queue for it, then open it.
    await removeLiveTab(context, browser.id);
    queuePasteForBrowser(browser.id, finalText, fileRef);
    await openFreshChat("new");
    return;
  }

  // First send (or bridge off): open the chat. Queued when possible, so
  // the new tab auto-fills when its editor loads — no manual paste needed.
  if (canQueue) {
    queuePasteForBrowser(browser.id, finalText, fileRef);
  }
  await openFreshChat(live ? "bridge-off" : "first");

  // Opens a new chat URL. Shared by first-send, explicit new-chat, and
  // bridge-off fallbacks — only the hint differs.
  async function openFreshChat(reason: "first" | "new" | "bridge-off"): Promise<void> {
    await setLiveTab(context, browser.id, getBrowserUrl(browser), "", true);
    const url: string = getBrowserUrl(browser);
    try {
      const uri: vscode.Uri = vscode.Uri.parse(url);
      const opened: boolean = await vscode.env.openExternal(uri);
      if (opened) {
        const hint =
          reason === "new"
            ? `Opening a fresh ${browser.id} chat — fills when it loads. Your old tab stays open.`
            : reason === "first"
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
          `$(globe) SelectBeam: opened ${browser.id} — ${reason === "bridge-off" ? `code is in your clipboard, press ${pasteHint()} there` : "auto-fill queued"}`,
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
}
