// SelectBeam — all vscode state (workspace + global) in one place.
// workspaceState = per-folder memory (terminals). globalState = machine
// memory (bridge token + live tabs, so the companion popup works across
// windows).

import * as vscode from "vscode";
import * as crypto from "crypto";
import {
  KEY_AGENT_MAP,
  KEY_BRIDGE_TOKEN,
  KEY_FORCE_CLIPBOARD,
  KEY_LAST_BROWSER,
  KEY_LIVE_TABS,
  KEY_REMEMBERED_TERMINAL,
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
  const ttlMin = Math.max(1, getLiveTabTTLMinutes());
  if (Date.now() - tab.updatedAt >= ttlMin * 60_000) {
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

export function ageLabel(updatedAt: number): string {
  const s = Math.max(1, Math.round((Date.now() - updatedAt) / 1000));
  if (s < 60) {
    return `${s}s ago`;
  }
  return `${Math.round(s / 60)}m ago`;
}

// --- Bridge token ----------------------------------------------------------

export async function getOrCreateBridgeToken(
  context: vscode.ExtensionContext
): Promise<string> {
  let token = context.globalState.get<string | undefined>(KEY_BRIDGE_TOKEN);
  if (!token) {
    token = crypto.randomBytes(16).toString("hex");
    await context.globalState.update(KEY_BRIDGE_TOKEN, token);
  }
  return token;
}
