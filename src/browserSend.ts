import * as vscode from "vscode";
import { BROWSERS, findBrowser } from "./constants";
import { getBrowserUrl, getDefaultBrowser, getRememberBrowserChoice, getReuseBrowserTab } from "./config";
import { pasteHint } from "./platform";
import { buildPayload, copyToClipboard } from "./payload";
import { ageLabel, getLastBrowserId, getLiveTab, removeLiveTab, setLastBrowserId, setLiveTab } from "./state";
import { isBridgeOwner, queuePasteForBrowser, showBridgeStatus } from "./bridge";
import { openUrlInSystemBrowser, resolveSystemBrowser } from "./systemBrowser";
import type { BrowserDef } from "./types";

export async function sendToBrowser(context: vscode.ExtensionContext, forceAsk = true): Promise<void> {
  const editor: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showWarningMessage("SelectBeam: No active editor.");
    return;
  }
  if (editor.selection.isEmpty) {
    void vscode.window.showWarningMessage("SelectBeam: Select some code first.");
    return;
  }
  const { payload, relativePath, startLine, endLine } = buildPayload(editor);
  const browser: BrowserDef | "clipboard" | undefined = await resolveBrowser(context, forceAsk);
  if (!browser) {
    return;
  }
  if (browser === "clipboard") {
    await copyToClipboard(payload, `$(clippy) SelectBeam: copied ${relativePath} (lines ${startLine}-${endLine})`);
    return;
  }
  await sendToBrowserTarget(context, browser, payload, relativePath, startLine, endLine);
}

async function resolveBrowser(context: vscode.ExtensionContext, forceAsk = false): Promise<BrowserDef | "clipboard" | undefined> {
  const defaultBrowser = forceAsk ? "ask" : getDefaultBrowser();
  if (defaultBrowser !== "ask" && defaultBrowser !== "last") {
    const fixed = findBrowser(defaultBrowser);
    if (fixed) {
      return fixed;
    }
  }
  if (defaultBrowser === "last") {
    const last = findBrowser(getLastBrowserId(context) ?? "");
    if (last) {
      return last;
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
    { label: "$(clippy) Clipboard only", description: "Just copy, don't open a browser", pickKind: "clipboard" },
  ];
  const picked: BrowserPick | undefined = await vscode.window.showQuickPick<BrowserPick>(items, {
    placeHolder: `SelectBeam: pick a browser AI (remembered after this — paste once with ${pasteHint()} only if the companion is missing)`,
  });
  if (!picked || picked.pickKind === "clipboard") {
    return picked ? "clipboard" : undefined;
  }
  await rememberBrowser(context, picked.browser!.id);
  return picked.browser!;
}

async function rememberBrowser(context: vscode.ExtensionContext, browserId: string): Promise<void> {
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
  const finalText: string = payload;
  const fileRef = `${relativePath} (lines ${startLine}-${endLine})`;
  await vscode.env.clipboard.writeText(finalText);
  const systemApp = await resolveSystemBrowser(context);
  if (!systemApp) {
    return;
  }
  const appName = systemApp.label.replace(/^\$\([^)]+\)\s*/, "");
  const canQueue = isBridgeOwner() && getReuseBrowserTab();
  const live = getLiveTab(context, browser.id);

  async function openFreshChat(
    reason: "first" | "new" | "bridge-off",
    app: NonNullable<Awaited<ReturnType<typeof resolveSystemBrowser>>>
  ): Promise<void> {
    await setLiveTab(context, browser.id, getBrowserUrl(browser), "", true);
    const url: string = getBrowserUrl(browser);
    try {
      const opened: boolean = await openUrlInSystemBrowser(url, app);
      if (!opened) {
        vscode.window.setStatusBarMessage("$(clippy) SelectBeam: browser would not open — code copied to clipboard instead", 3000);
        return;
      }
      const hint =
        reason === "new"
          ? `Opening a fresh ${browser.id} tab in ${appName} — fills when it loads. Your old tab stays open.`
          : reason === "first"
            ? `Opening ${browser.id} in ${appName} — code fills itself when the chat loads.`
            : `Bridge is ${isBridgeOwner() ? "off" : "owned by another window"} — opened ${browser.id} in ${appName} normally. Press ${pasteHint()} there.`;
      void vscode.window
        .showInformationMessage(`SelectBeam: ${fileRef} copied — ${hint}`, "Copy again", "Bridge status")
        .then(async (action: string | undefined): Promise<void> => {
          if (action === "Copy again") {
            await vscode.env.clipboard.writeText(finalText);
          } else if (action === "Bridge status") {
            await showBridgeStatus(context);
          }
        });
      vscode.window.setStatusBarMessage(
        `$(globe) SelectBeam: opened ${browser.id} in ${appName} — ${reason === "bridge-off" ? `code is in your clipboard, press ${pasteHint()} there` : "auto-fill queued"}`,
        5000
      );
    } catch {
      vscode.window.setStatusBarMessage("$(clippy) SelectBeam: could not open browser — code copied to clipboard instead", 3000);
    }
  }

  if (live && canQueue) {
    interface ReusePick extends vscode.QuickPickItem {
      choice: "last" | "new";
    }
    const pick: ReusePick | undefined = await vscode.window.showQuickPick<ReusePick>(
      [
        {
          label: "$(history) Existing tab",
          description: `"${live.title || live.url}" (${ageLabel(live.updatedAt)}) — refill it in ${appName}`,
          choice: "last",
        },
        {
          label: "$(plus) New tab",
          description: `Open a fresh ${browser.id} tab in ${appName} and fill it there`,
          choice: "new",
        },
      ],
      { placeHolder: `SelectBeam: refill your existing ${browser.id} tab in ${appName}, or open a new tab?` }
    );
    if (!pick) {
      return;
    }
    if (pick.choice === "last") {
      queuePasteForBrowser(browser.id, finalText, fileRef);
      vscode.window.setStatusBarMessage(
        `$(globe) SelectBeam: sent ${fileRef} to ${browser.id} tab in ${appName} — filling…`,
        5000
      );
      return;
    }
    await removeLiveTab(context, browser.id);
    queuePasteForBrowser(browser.id, finalText, fileRef);
    await openFreshChat("new", systemApp);
    return;
  }
  if (canQueue) {
    queuePasteForBrowser(browser.id, finalText, fileRef);
  }
  await openFreshChat(live ? "bridge-off" : "first", systemApp);
}
