import type { AgentDef, BrowserDef, SystemBrowserDef } from "./types";

export const KEY_REMEMBERED_TERMINAL = "selectbeam.rememberedTerminalName";
export const KEY_FORCE_CLIPBOARD = "selectbeam.forceClipboard";
export const KEY_AGENT_MAP = "selectbeam.terminalAgents";
export const KEY_LAST_BROWSER = "selectbeam.lastBrowserId";
export const KEY_LAST_SYSTEM_BROWSER = "selectbeam.lastSystemBrowserId";
export const KEY_LIVE_TABS = "selectbeam.liveTabs";
export const EXT_ORIGIN_PREFIXES = ["moz-extension://", "chrome-extension://"];

export const BRIDGE_VERSION = "0.0.5";
export const MAX_PENDING = 20;
export const LIVE_REUSE_WINDOW_MS = 90_000;
export const MAX_BODY_BYTES = 2 * 1024 * 1024;
export const MAX_PASTE_CHARS = 500_000;

export const AGENTS: AgentDef[] = [
  { id: "opencode", label: "$(terminal) OpenCode", description: "Launch `opencode`", defaultCommand: "opencode" },
  { id: "claude", label: "$(terminal) Claude Code", description: "Launch `claude`", defaultCommand: "claude" },
  { id: "codex", label: "$(terminal) Codex CLI", description: "Launch `codex`", defaultCommand: "codex" },
  { id: "copilot", label: "$(terminal) Copilot CLI", description: "Launch `copilot`", defaultCommand: "copilot" },
  { id: "aider", label: "$(terminal) aider", description: "Launch `aider`", defaultCommand: "aider" },
  { id: "gemini", label: "$(terminal) Gemini CLI", description: "Launch `gemini`", defaultCommand: "gemini" },
  { id: "qwen", label: "$(terminal) Qwen Code", description: "Launch `qwen`", defaultCommand: "qwen" },
  { id: "cursor-agent", label: "$(terminal) Cursor agent", description: "Launch `cursor-agent`", defaultCommand: "cursor-agent" },
  { id: "amp", label: "$(terminal) Amp", description: "Launch `amp`", defaultCommand: "amp" },
  { id: "agy", label: "$(terminal) Anti-Gravity", description: "Launch `agy`", defaultCommand: "agy" },
  { id: "crush", label: "$(terminal) Crush", description: "Launch `crush`", defaultCommand: "crush" },
  { id: "goose", label: "$(terminal) Goose", description: "Launch `goose`", defaultCommand: "goose" },
];

export const BROWSERS: BrowserDef[] = [
  { id: "chatgpt", label: "$(globe) ChatGPT", description: "Copy + open chatgpt.com", defaultUrl: "https://chatgpt.com/" },
  { id: "claude", label: "$(globe) Claude", description: "Copy + open claude.ai", defaultUrl: "https://claude.ai/new" },
  { id: "gemini", label: "$(globe) Gemini", description: "Copy + open gemini.google.com", defaultUrl: "https://gemini.google.com/app" },
  { id: "deepseek", label: "$(globe) DeepSeek", description: "Copy + open chat.deepseek.com", defaultUrl: "https://chat.deepseek.com/" },
  { id: "grok", label: "$(globe) Grok", description: "Copy + open grok.com", defaultUrl: "https://grok.com/" },
  { id: "copilot", label: "$(globe) Copilot", description: "Copy + open copilot.microsoft.com", defaultUrl: "https://copilot.microsoft.com/" },
];

export const SYSTEM_BROWSERS: SystemBrowserDef[] = [
  { id: "system", label: "$(globe) System default", description: "OS default browser (openExternal)" },
  { id: "firefox", label: "$(globe) Firefox", description: "Open in Firefox" },
  { id: "edge", label: "$(globe) Edge", description: "Open in Microsoft Edge" },
  { id: "chrome", label: "$(globe) Chrome", description: "Open in Google Chrome" },
  { id: "chromium", label: "$(globe) Chromium", description: "Open in Chromium" },
  { id: "brave", label: "$(globe) Brave", description: "Open in Brave" },
];

export function findSystemBrowser(id: string): SystemBrowserDef | undefined {
  return SYSTEM_BROWSERS.find((b): boolean => b.id === id);
}

export function isKnownProvider(id: string): boolean {
  return BROWSERS.some((b): boolean => b.id === id);
}

export function findBrowser(id: string): BrowserDef | undefined {
  return BROWSERS.find((b): boolean => b.id === id);
}
