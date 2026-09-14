// SelectBeam — shared types. No runtime code, no imports except vscode
// for the QuickPickItem extensions used by the pickers.

import * as vscode from "vscode";

export type DefaultTarget = "auto" | "clipboard" | "terminal";
export type DefaultBrowser =
  | "ask"
  | "last"
  | "chatgpt"
  | "claude"
  | "gemini"
  | "deepseek";

export interface AgentDef {
  id: string;
  label: string;
  description: string;
  // Default launch command; overridable via `selectbeam.agentCommands`.
  defaultCommand: string;
}

export interface BrowserDef {
  id: Exclude<DefaultBrowser, "ask" | "last">;
  label: string;
  description: string;
  // Default chat URL; overridable via `selectbeam.browserUrls`.
  defaultUrl: string;
}

/** One linked chat tab, reported by the companion (browser -> vscode). */
export interface LiveTab {
  provider: string;
  url: string;
  title: string;
  updatedAt: number;
}

/** One queued send waiting for the companion to poll it. In-memory only. */
export interface PendingPaste {
  id: string;
  provider: string;
  text: string;
  fileRef: string;
  createdAt: number;
}

/** No-terminal picker: terminal agent | browser AI | clipboard. */
export interface DestinationPick extends vscode.QuickPickItem {
  destKind: "agent" | "browser" | "clipboard";
  agent?: AgentDef;
  browser?: BrowserDef;
}
