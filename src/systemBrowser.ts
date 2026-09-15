import * as vscode from "vscode";
import * as fs from "fs";
import { spawn, spawnSync } from "child_process";
import { SYSTEM_BROWSERS, findSystemBrowser } from "./constants";
import { getDefaultSystemBrowser, getRememberSystemBrowserChoice } from "./config";
import { getLastSystemBrowserId, setLastSystemBrowserId } from "./state";
import type { SystemBrowserDef } from "./types";

export async function resolveSystemBrowser(context: vscode.ExtensionContext): Promise<SystemBrowserDef | undefined> {
  const def = getDefaultSystemBrowser();
  if (def !== "ask" && def !== "last") {
    const fixed = findSystemBrowser(def);
    if (fixed) {
      return fixed;
    }
  }
  if (def === "last") {
    const last = findSystemBrowser(getLastSystemBrowserId(context) ?? "");
    if (last) {
      return last;
    }
  }
  interface SystemPick extends vscode.QuickPickItem {
    browser: SystemBrowserDef;
  }
  const lastId = getLastSystemBrowserId(context);
  const items: SystemPick[] = SYSTEM_BROWSERS.map(
    (b: SystemBrowserDef): SystemPick => ({
      label: b.id === lastId ? `${b.label} $(history)` : b.label,
      description: b.id === lastId ? `Last used — ${b.description}` : b.description,
      browser: b,
    })
  );
  const picked: SystemPick | undefined = await vscode.window.showQuickPick<SystemPick>(items, {
    placeHolder: "SelectBeam: open the chat in which browser? (Firefox / Edge / …)",
  });
  if (!picked) {
    return undefined;
  }
  if (getRememberSystemBrowserChoice()) {
    await setLastSystemBrowserId(context, picked.browser.id);
  }
  return picked.browser;
}

export async function openUrlInSystemBrowser(url: string, app: SystemBrowserDef): Promise<boolean> {
  if (app.id === "system") {
    try {
      return await vscode.env.openExternal(vscode.Uri.parse(url));
    } catch {
      return false;
    }
  }
  if (trySpawnApp(app.id, url)) {
    return true;
  }
  void vscode.window.showWarningMessage(
    `SelectBeam: ${app.label.replace(/^\$\([^)]+\)\s*/, "")} not found — opened in system default instead.`
  );
  try {
    return await vscode.env.openExternal(vscode.Uri.parse(url));
  } catch {
    return false;
  }
}

function appCandidates(appId: string): string[][] {
  if (process.platform === "darwin") {
    const macApp: Record<string, string> = {
      firefox: "Firefox",
      edge: "Microsoft Edge",
      chrome: "Google Chrome",
      chromium: "Chromium",
      brave: "Brave Browser",
    };
    return macApp[appId] ? [["open", "-a", macApp[appId] as string]] : [];
  }
  if (process.platform === "win32") {
    const pf = process.env["PROGRAMFILES"] ?? "C:\\Program Files";
    const pf86 = process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)";
    const local = process.env["LOCALAPPDATA"] ?? "";
    const winBin: Record<string, string[][]> = {
      firefox: [["firefox"], [`${pf}\\Mozilla Firefox\\firefox.exe`], [`${pf86}\\Mozilla Firefox\\firefox.exe`]],
      edge: [["msedge"], [`${pf}\\Microsoft\\Edge\\Application\\msedge.exe`], [`${pf86}\\Microsoft\\Edge\\Application\\msedge.exe`]],
      chrome: [["chrome"], [`${pf}\\Google\\Chrome\\Application\\chrome.exe`], [`${pf86}\\Google\\Chrome\\Application\\chrome.exe`]],
      chromium: [["chromium"]],
      brave: [["brave"], [`${pf}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`]],
    };
    if (local) {
      winBin["brave"]!.push([`${local}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`]);
    }
    return winBin[appId] ?? [];
  }
  const linuxBins: Record<string, string[][]> = {
    firefox: [["firefox"]],
    edge: [["microsoft-edge-stable"], ["microsoft-edge"]],
    chrome: [["google-chrome-stable"], ["google-chrome"]],
    chromium: [["chromium"], ["chromium-browser"]],
    brave: [["brave-browser"], ["brave"]],
  };
  return linuxBins[appId] ?? [];
}

function commandExists(cmd: string): boolean {
  if (!cmd) {
    return false;
  }
  if (process.platform === "darwin" && cmd === "open") {
    return true;
  }
  if (/[\\/]/.test(cmd)) {
    try {
      return fs.existsSync(cmd);
    } catch {
      return false;
    }
  }
  try {
    if (process.platform === "win32") {
      return spawnSync("where", [cmd], { stdio: "ignore", shell: true }).status === 0;
    }
    return spawnSync("which", [cmd], { stdio: "ignore" }).status === 0;
  } catch {
    return false;
  }
}

function trySpawnApp(appId: string, url: string): boolean {
  for (const [cmd, ...args] of appCandidates(appId)) {
    if (!cmd || !commandExists(cmd)) {
      continue;
    }
    try {
      const child = spawn(cmd, [...args, url], {
        detached: true,
        stdio: "ignore",
        shell: process.platform === "win32" && !/[\\/]/.test(cmd),
      });
      child.on("error", (): void => undefined);
      child.unref();
      return true;
    } catch {
      continue;
    }
  }
  return false;
}
