// SelectBeam — constants: storage keys, limits, agent + browser catalogs.
// No vscode import; pure data so every module can share it.

import type { AgentDef, BrowserDef } from "./types";

// --- State keys ------------------------------------------------------------

// Terminal name -> remembered target terminal (workspace-scoped).
export const KEY_REMEMBERED_TERMINAL = "selectbeam.rememberedTerminalName";
// Session pin for clipboard-only (set via chooseTarget).
export const KEY_FORCE_CLIPBOARD = "selectbeam.forceClipboard";
// Terminal name -> agent id we launched there. Absence means
// "unknown / probably plain shell" -> we ask before pasting.
export const KEY_AGENT_MAP = "selectbeam.terminalAgents";
// Last browser AI picked (e.g. "chatgpt"). Used by `defaultBrowser: "last"`.
export const KEY_LAST_BROWSER = "selectbeam.lastBrowserId";
// Live-tab memory: provider -> LiveTab (global-scoped so the companion
// popup works across windows).
export const KEY_LIVE_TABS = "selectbeam.liveTabs";
// Origin schemes allowed to call the bridge (the companion only —
// web pages send http(s) origins and are rejected, so no token needed).
export const EXT_ORIGIN_PREFIXES = ["moz-extension://", "chrome-extension://"];

// --- Bridge limits ---------------------------------------------------------

export const BRIDGE_VERSION = "0.0.3";
// Max queued pastes kept in memory (temporary, not persisted).
export const MAX_PENDING = 20;
// Reuse window: a tab only counts as "the same tab" if it heartbeated
// within the last 90s. Open tabs beat every 15s, so a live tab always
// passes; a closed tab stops beating and we open a FRESH chat instead of
// sending into the void. The TTL setting remains as the outer bound.
export const LIVE_REUSE_WINDOW_MS = 90_000;
// Max JSON body for bridge POSTs (2 MB — code selections are small).
export const MAX_BODY_BYTES = 2 * 1024 * 1024;
// Max queued paste text (500 KB guard on the /queue forward path).
export const MAX_PASTE_CHARS = 500_000;

// --- Catalogs --------------------------------------------------------------

// The terminal agents we support. Commands are the standard CLI
// entry points; users can override them in settings if theirs differ
// (e.g. `gh copilot` vs `copilot`, or a renamed binary).
// Run-once tools (e.g. sgpt) are intentionally NOT here: they exit
// immediately, so launch-then-paste cannot work with them.
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

// Free browser chat targets. URLs are the canonical "new chat" entry points.
export const BROWSERS: BrowserDef[] = [
  { id: "chatgpt", label: "$(globe) ChatGPT", description: "Copy + open chatgpt.com", defaultUrl: "https://chatgpt.com/" },
  { id: "claude", label: "$(globe) Claude", description: "Copy + open claude.ai", defaultUrl: "https://claude.ai/new" },
  { id: "gemini", label: "$(globe) Gemini", description: "Copy + open gemini.google.com", defaultUrl: "https://gemini.google.com/app" },
  { id: "deepseek", label: "$(globe) DeepSeek", description: "Copy + open chat.deepseek.com", defaultUrl: "https://chat.deepseek.com/" },
  { id: "grok", label: "$(globe) Grok", description: "Copy + open grok.com", defaultUrl: "https://grok.com/" },
  { id: "copilot", label: "$(globe) Copilot", description: "Copy + open copilot.microsoft.com", defaultUrl: "https://copilot.microsoft.com/" },
];

export function isKnownProvider(id: string): boolean {
  return BROWSERS.some((b): boolean => b.id === id);
}

export function findBrowser(id: string): BrowserDef | undefined {
  return BROWSERS.find((b): boolean => b.id === id);
}
