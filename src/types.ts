import * as vscode from "vscode";

export type DefaultTarget = "auto" | "clipboard" | "terminal";
export type DefaultBrowser = "ask" | "last" | "chatgpt" | "claude" | "gemini" | "deepseek" | "grok" | "copilot";
export type DefaultSystemBrowser = "ask" | "last" | "system" | "firefox" | "edge" | "chrome" | "chromium" | "brave";

export interface SystemBrowserDef {
  id: Exclude<DefaultSystemBrowser, "ask" | "last">;
  label: string;
  description: string;
}

export interface AgentDef {
  id: string;
  label: string;
  description: string;
  defaultCommand: string;
}

export interface BrowserDef {
  id: Exclude<DefaultBrowser, "ask" | "last">;
  label: string;
  description: string;
  defaultUrl: string;
}

export interface LiveTab {
  provider: string;
  url: string;
  title: string;
  updatedAt: number;
}

export interface PendingPaste {
  id: string;
  provider: string;
  text: string;
  fileRef: string;
  createdAt: number;
}

export interface DestinationPick extends vscode.QuickPickItem {
  destKind: "agent" | "browser" | "clipboard";
  agent?: AgentDef;
  browser?: BrowserDef;
}
