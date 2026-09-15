// SelectBeam — system browser app picker + launcher (Firefox / Edge / …).
// The AI chat (ChatGPT, Gemini, …) is separate from the app that opens it.
// This module asks "which app?" and opens a URL in that app. `system` uses
// vscode.openExternal (OS default). Named apps spawn their binary directly
// so Firefox vs Edge is a real choice on Fedora / Mac / Windows.

import * as vscode from "vscode";
import { spawn, spawnSync } from "child_process";
import { SYSTEM_BROWSERS, findSystemBrowser } from "./constants";
import {
  getDefaultSystemBrowser,
  getRememberSystemBrowserChoice,
} from "./config";
import {
  getLastSystemBrowserId,
  setLastSystemBrowserId,
} from "./state";
import type { SystemBrowserDef } from "./types";

export async function resolveSystemBrowser(
  context: vscode.ExtensionContext
): Promise<SystemBrowserDef | undefined> {
  const def = getDefaultSystemBrowser();

  if (def !== "ask" && def !== "last") {
    const fixed = findSystemBrowser(def);
    if (fixed) {
      return fixed;
    }
  }

  if (def === "last") {
    const lastId = getLastSystemBrowserId(context);
    if (lastId) {
      const last = findSystemBrowser(lastId);
      if (last) {
        return last;
      }
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
  const picked: SystemPick | undefined =
    await vscode.window.showQuickPick<SystemPick>(items, {
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

// Open a URL in the chosen app. Returns true when something was launched.
// Named apps fall back to openExternal when their binary is missing.
export async function openUrlInSystemBrowser(
  url: string,
  app: SystemBrowserDef
): Promise<boolean> {
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
  // Binary not found (e.g. Edge not installed on Fedora yet) — fall back
  // to the OS default so the send is never lost, and say so.
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
  // Each entry: [command, ...fixedArgs]. URL appended last (except mac `open`).
  if (process.platform === "darwin") {
    const macApp: Record<string, string> = {
      firefox: "Firefox",
      edge: "Microsoft Edge",
      chrome: "Google Chrome",
      chromium: "Chromium",
      brave: "Brave Browser",
    };
    const name = macApp[appId];
    if (name) {
      return [["open", "-a", name]];
    }
    return [];
  }
  if (process.platform === "win32") {
    const winBin: Record<string, string[]> = {
      firefox: ["firefox"],
      edge: ["msedge"],
      chrome: ["chrome"],
      chromium: ["chromium"],
      brave: ["brave"],
    };
    return winBin[appId] ? [winBin[appId] as string[]] : [];
  }
  // Linux (Fedora etc.): binary names per vendor docs.
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
  if (process.platform === "darwin" && cmd === "open") {
    return true;
  }
  try {
    if (process.platform === "win32") {
      const r = spawnSync("where", [cmd], { stdio: "ignore", shell: true });
      return r.status === 0;
    }
    const r = spawnSync("which", [cmd], { stdio: "ignore" });
    return r.status === 0;
  } catch {
    return false;
  }
}

function trySpawnApp(appId: string, url: string): boolean {
  const candidates = appCandidates(appId);
  for (const [cmd, ...args] of candidates) {
    if (!cmd || !commandExists(cmd)) {
      continue;
    }
    try {
      const child = spawn(cmd, [...args, url], {
        detached: true,
        stdio: "ignore",
        shell: process.platform === "win32",
      });
      child.on("error", (): void => {
        // Error handled via fallback — spawn failure below covers it
        // when the process never starts, but late errors are ignored
        // since the send itself (clipboard + queue) already succeeded.
      });
      child.unref();
      return true;
    } catch {
      continue;
    }
  }
  return false;
}
