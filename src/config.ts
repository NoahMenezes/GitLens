// SelectBeam — all `selectbeam.*` settings read in one place, so defaults
// live next to package.json and behavior modules stay thin.

import * as vscode from "vscode";
import type { BrowserDef, DefaultBrowser, DefaultTarget } from "./types";

function cfg(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration("selectbeam");
}

export function getDefaultTarget(): DefaultTarget {
  return cfg().get<DefaultTarget>("defaultTarget", "auto");
}

export function getRememberTerminalChoice(): boolean {
  return cfg().get<boolean>("rememberTerminalChoice", true);
}

export function getAskForPrompt(): boolean {
  return cfg().get<boolean>("askForPrompt", true);
}

export function getAgentStartDelayMs(): number {
  return cfg().get<number>("agentStartDelayMs", 2000);
}

export function getAgentCommands(): Record<string, string> {
  return cfg().get<Record<string, string>>("agentCommands", {});
}

export function getDefaultBrowser(): DefaultBrowser {
  // "last" = ask once, then automatic. The palette command can still force
  // the picker (see resolveBrowser's forceAsk) so switching models is easy.
  return cfg().get<DefaultBrowser>("defaultBrowser", "last");
}

export function getRememberBrowserChoice(): boolean {
  return cfg().get<boolean>("rememberBrowserChoice", true);
}

export function getReuseBrowserTab(): boolean {
  return cfg().get<boolean>("reuseBrowserTab", true);
}

export function getLiveTabTTLMinutes(): number {
  return cfg().get<number>("liveTabTTLMinutes", 60);
}

export function isBridgeEnabledSetting(): boolean {
  return cfg().get<boolean>("bridgeEnabled", true);
}

export function getBridgePortSetting(): number {
  const p: number = cfg().get<number>("bridgePort", 51337);
  return Number.isInteger(p) && p > 0 && p < 65536 ? p : 51337;
}

export function getBrowserUrl(browser: BrowserDef): string {
  const overrides: Record<string, string> = cfg().get<Record<string, string>>(
    "browserUrls",
    {}
  );
  const override: string | undefined = overrides[browser.id];
  if (override && override.trim().length > 0) {
    return override.trim();
  }
  return browser.defaultUrl;
}
