// SelectBeam — all vscode state (workspace + global) in one place.
// workspaceState = per-folder memory (terminals, last browser pick).
// globalState = machine memory (live tabs, so the companion popup works
// across windows).

import * as vscode from "vscode";
import {
  KEY_AGENT_MAP,
  KEY_FORCE_CLIPBOARD,
  KEY_LAST_BROWSER,
  KEY_LIVE_TABS,
  KEY_REMEMBERED_TERMINAL,
  LIVE_REUSE_WINDOW_MS,
} from "./constants";
import { getLiveTabTTLMinutes } from "./config";
import type { LiveTab } from "./types";

// --- Terminal memory -------------------------------------------------------

export function getRememberedTerminal(
  context: vscode.ExtensionContext
): string | undefined {
  return context.workspaceState.get<string | undefined>(
    KEY_REMEMBERED_TERMINAL
  );
}

export async function setRememberedTerminal(
  context: vscode.ExtensionContext,
  name: string | undefined
): Promise<void> {
  await context.workspaceState.update(KEY_REMEMBERED_TERMINAL, name);
}

export function isForceClipboard(
  context: vscode.ExtensionContext
): boolean {
  return context.workspaceState.get<boolean>(KEY_FORCE_CLIPBOARD, false);
}

export async function setForceClipboard(
  context: vscode.ExtensionContext,
  value: boolean
): Promise<void> {
  await context.workspaceState.update(KEY_FORCE_CLIPBOARD, value);
}

export function getAgentMap(
  context: vscode.ExtensionContext
): Record<string, string> {
  return context.workspaceState.get<Record<string, string>>(
    KEY_AGENT_MAP,
    {}
  );
}

export function getAgentForTerminal(
  context: vscode.ExtensionContext,
  terminalName: string
): string | undefined {
  return getAgentMap(context)[terminalName];
}

export async function setAgentForTerminal(
  context: vscode.ExtensionContext,
  terminalName: string,
  agentId: string
): Promise<void> {
  const map: Record<string, string> = { ...getAgentMap(context) };
  map[terminalName] = agentId;
  await context.workspaceState.update(KEY_AGENT_MAP, map);
}

export async function clearAgentMap(
  context: vscode.ExtensionContext
): Promise<void> {
  await context.workspaceState.update(KEY_AGENT_MAP, undefined);
}

// --- Browser choice memory -------------------------------------------------

export function getLastBrowserId(
  context: vscode.ExtensionContext
): string | undefined {
  return context.workspaceState.get<string | undefined>(KEY_LAST_BROWSER);
}

export async function setLastBrowserId(
  context: vscode.ExtensionContext,
  browserId: string | undefined
): Promise<void> {
  await context.workspaceState.update(KEY_LAST_BROWSER, browserId);
}

// --- Live-tab memory (browser -> vscode direction) -------------------------

export function getLiveTabs(
  context: vscode.ExtensionContext
): Record<string, LiveTab> {
  return context.globalState.get<Record<string, LiveTab>>(KEY_LIVE_TABS, {});
}

export function getLiveTab(
  context: vscode.ExtensionContext,
  provider: string
): LiveTab | undefined {
  const tab = getLiveTabs(context)[provider];
  if (!tab) {
    return undefined;
  }
  // Only confirmed tabs count: provisional entries (written when we open a
  // chat URL, before the companion heartbeats) have an empty title.
  if (!tab.title) {
    return undefined;
  }
  // Freshness: open tabs heartbeat every 15s, so anything older than the
  // reuse window is a closed/navigated-away tab — open a fresh chat instead
  // of sending into a dead tab. TTL setting stays as the outer bound.
  const ttlMs = Math.max(1, getLiveTabTTLMinutes()) * 60_000;
  const windowMs = Math.min(ttlMs, LIVE_REUSE_WINDOW_MS);
  if (Date.now() - tab.updatedAt >= windowMs) {
    return undefined;
  }
  return tab;
}

export async function setLiveTab(
  context: vscode.ExtensionContext,
  provider: string,
  url: string,
  title: string,
  provisional = false
): Promise<void> {
  const all = { ...getLiveTabs(context) };
  const prev = all[provider];
  // Never overwrite a confirmed live tab with a provisional one.
  if (provisional && prev && prev.title) {
    return;
  }
  all[provider] = { provider, url, title, updatedAt: Date.now() };
  await context.globalState.update(KEY_LIVE_TABS, all);
}

export async function clearLiveTabs(
  context: vscode.ExtensionContext
): Promise<void> {
  await context.globalState.update(KEY_LIVE_TABS, {});
}

// A tab closed/navigated away: forget it now so the next send opens a
// FRESH chat instead of reusing a dead entry until the window lapses.
export async function removeLiveTab(
  context: vscode.ExtensionContext,
  provider: string
): Promise<void> {
  const all = { ...getLiveTabs(context) };
  if (all[provider]) {
    delete all[provider];
    await context.globalState.update(KEY_LIVE_TABS, all);
  }
}

// A fill was confirmed in the tab: refresh its heartbeat so it stays the
// remembered tab for the next send.
export async function touchLiveTab(
  context: vscode.ExtensionContext,
  provider: string
): Promise<void> {
  const all = { ...getLiveTabs(context) };
  const prev = all[provider];
  if (prev) {
    all[provider] = { ...prev, updatedAt: Date.now() };
    await context.globalState.update(KEY_LIVE_TABS, all);
  }
}

export function ageLabel(updatedAt: number): string {
  const s = Math.max(1, Math.round((Date.now() - updatedAt) / 1000));
  if (s < 60) {
    return `${s}s ago`;
  }
  return `${Math.round(s / 60)}m ago`;
}
