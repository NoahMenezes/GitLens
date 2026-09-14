// SelectBeam — browser send path: resolve target, reuse live tab via the
// bridge queue (SAME tab, no new-tab spam) or fall back to copy + open.
// Clipboard is ALWAYS written first so paste-once still works when the
// companion is missing. Never auto-submits.

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
  withOptionalInstruction,
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

// `selectbeam.sendToBrowser` — honors `selectbeam.defaultBrowser`
// ("ask" | "last" | specific id) and remembers the pick for "last" mode.
export async function sendToBrowser(
  context: vscode.ExtensionContext
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
    await resolveBrowser(context);
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

// Resolve which browser AI to use: explicit default -> use it; "last" ->
// reuse remembered pick (or ask); "ask" -> picker with clipboard fallback.
async function resolveBrowser(
  context: vscode.ExtensionContext
): Promise<BrowserDef | "clipboard" | undefined> {
  const defaultBrowser = getDefaultBrowser();

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
  const items: BrowserPick[] = [
    ...BROWSERS.map(
      (b: BrowserDef): BrowserPick => ({
        label: b.label,
        description: b.description,
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
      placeHolder: `SelectBeam: pick a browser AI (code is copied — paste once with ${pasteHint()})`,
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
  const finalText: string = await withOptionalInstruction(
    relativePath, startLine, endLine, `${browser.id} `, payload
  );
  const fileRef = `${relativePath} (lines ${startLine}-${endLine})`;

  await vscode.env.clipboard.writeText(finalText);

  // 1) Try SAME-tab reuse: fresh live tab + reuse on + bridge owns port.
  const live = getLiveTab(context, browser.id);
  if (live && getReuseBrowserTab() && isBridgeOwner()) {
    queuePasteForBrowser(browser.id, finalText, fileRef);
    void vscode.window.showInformationMessage(
      `SelectBeam: ${fileRef} queued for your open ${browser.id} tab "${live.title || live.url}" (${ageLabel(live.updatedAt)}) — it auto-fills in ~2s. Else press ${pasteHint()} there.`,
      "Copy again"
    ).then(async (action: string | undefined): Promise<void> => {
      if (action === "Copy again") {
        await vscode.env.clipboard.writeText(finalText);
      }
    });
    vscode.window.setStatusBarMessage(
      `$(globe) SelectBeam: reusing ${browser.id} tab — no new tab opened`,
      5000
    );
    return;
  }

  // 2) No live tab (or bridge off): remember a provisional entry so the
  // companion can claim it on heartbeat, then open the site (new chat).
  await setLiveTab(context, browser.id, getBrowserUrl(browser), "", true);
  const url: string = getBrowserUrl(browser);
  try {
    const uri: vscode.Uri = vscode.Uri.parse(url);
    const opened: boolean = await vscode.env.openExternal(uri);
    if (opened) {
      const hint = live && !isBridgeOwner()
        ? `Bridge is owned by another window — opened ${browser.id} normally. Press ${pasteHint()} there.`
        : `No linked ${browser.id} tab yet — opened a chat. Link it in the companion popup, next send reuses it. Press ${pasteHint()} there.`;
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
        `$(globe) SelectBeam: opened ${browser.id} — code is in your clipboard, press ${pasteHint()} there`,
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
