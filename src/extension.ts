// SelectBeam — terminal-first send with agent auto-launch + browser AI send.
//
// Two send paths (both free, no API keys):
// - TERMINAL: `selectbeam.sendSelection` formats the selection as markdown,
//   resolves a target terminal, then makes sure an AI CLI is running there
//   BEFORE pasting. We never blind-paste a ``` fence into a plain shell
//   (that is what caused the `bquote>` mess in zsh — backticks start command
//   substitution, so the shell waits for a closing backtick).
// - BROWSER: `selectbeam.sendToBrowser` formats the same payload, copies it to
//   the clipboard, then opens ChatGPT / Claude / Gemini / DeepSeek in your
//   default browser via `vscode.env.openExternal()`. VS Code extensions
//   CANNOT type into external browser tabs (sandbox), so the user presses
//   Ctrl+V once in the chat box. If the site is already open, the browser
//   typically focuses the existing tab itself.
//
// VS Code API notes (for learning):
// - `terminal.sendText(text, addNewLine)`: 2nd param = press Enter or not.
//   `true` executes a shell command (used to LAUNCH the agent).
//   `false` just types (used to PASTE code into the agent's prompt).
// - VS Code exposes NO API to see what process runs inside a terminal, so
//   we track it ourselves in `workspaceState` (terminal name -> agent id).
//   If we didn't launch anything there, we assume plain shell and ask.
// - `workspaceState.get/update`: workspace-scoped key/value memory.
// - `showQuickPick` / `showInputBox`: modal UI; returns `undefined` on Esc.

import * as vscode from "vscode";

// ---------------------------------------------------------------------------
// WorkspaceState keys
// ---------------------------------------------------------------------------

// Terminal name -> remembered target terminal (avoid re-asking, multi-term).
const KEY_REMEMBERED_TERMINAL = "selectbeam.rememberedTerminalName";
// Session pin for clipboard-only (set via chooseTarget).
const KEY_FORCE_CLIPBOARD = "selectbeam.forceClipboard";
// Terminal name -> agent id we launched there (e.g. { "pwsh": "opencode" }).
// Absence means "unknown / probably plain shell" -> we ask before pasting.
const KEY_AGENT_MAP = "selectbeam.terminalAgents";
// Last browser AI picked (e.g. "chatgpt"). Used by `defaultBrowser: "last"`.
const KEY_LAST_BROWSER = "selectbeam.lastBrowserId";

type DefaultTarget = "auto" | "clipboard" | "terminal";
type DefaultBrowser = "ask" | "last" | "chatgpt" | "claude" | "gemini" | "deepseek";

interface AgentDef {
  id: string;
  label: string;
  description: string;
  // Default launch command; overridable via `selectbeam.agentCommands`.
  defaultCommand: string;
}

// The five terminal agents we support. Commands are the standard CLI
// entry points; users can override them in settings if theirs differ
// (e.g. `gh copilot` vs `copilot`).
const AGENTS: AgentDef[] = [
  { id: "opencode", label: "$(terminal) OpenCode", description: "Launch `opencode`", defaultCommand: "opencode" },
  { id: "claude", label: "$(terminal) Claude Code", description: "Launch `claude`", defaultCommand: "claude" },
  { id: "codex", label: "$(terminal) Codex CLI", description: "Launch `codex`", defaultCommand: "codex" },
  { id: "copilot", label: "$(terminal) Copilot CLI", description: "Launch `copilot`", defaultCommand: "copilot" },
  { id: "aider", label: "$(terminal) aider", description: "Launch `aider`", defaultCommand: "aider" },
];

interface BrowserDef {
  id: Exclude<DefaultBrowser, "ask" | "last">;
  label: string;
  description: string;
  // Default chat URL; overridable via `selectbeam.browserUrls`.
  defaultUrl: string;
}

// Free browser chat targets. URLs are the canonical "new chat" entry points.
// VS Code can only OPEN these (openExternal) — it cannot auto-paste into
// them, so we always copy the payload to the clipboard first.
const BROWSERS: BrowserDef[] = [
  { id: "chatgpt", label: "$(globe) ChatGPT", description: "Copy + open chatgpt.com", defaultUrl: "https://chatgpt.com/" },
  { id: "claude", label: "$(globe) Claude", description: "Copy + open claude.ai", defaultUrl: "https://claude.ai/new" },
  { id: "gemini", label: "$(globe) Gemini", description: "Copy + open gemini.google.com", defaultUrl: "https://gemini.google.com/app" },
  { id: "deepseek", label: "$(globe) DeepSeek", description: "Copy + open chat.deepseek.com", defaultUrl: "https://chat.deepseek.com/" },
];

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "selectbeam.sendSelection",
      async (): Promise<void> => sendSelection(context)
    ),
    vscode.commands.registerCommand(
      "selectbeam.sendToBrowser",
      async (): Promise<void> => sendToBrowser(context)
    ),
    vscode.commands.registerCommand(
      "selectbeam.chooseTarget",
      async (): Promise<void> => chooseTarget(context)
    )
  );
}

// ---------------------------------------------------------------------------
// Main command
// ---------------------------------------------------------------------------
async function sendSelection(
  context: vscode.ExtensionContext
): Promise<void> {
  const editor: vscode.TextEditor | undefined =
    vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showWarningMessage("SelectBeam: No active editor.");
    return;
  }
  if (editor.selection.isEmpty) {
    void vscode.window.showWarningMessage(
      "SelectBeam: Select some code first."
    );
    return;
  }

  const { payload, relativePath, startLine, endLine } =
    buildPayload(editor);

  const config: vscode.WorkspaceConfiguration =
    vscode.workspace.getConfiguration("selectbeam");
  const defaultTarget: DefaultTarget = config.get<DefaultTarget>(
    "defaultTarget",
    "auto"
  );
  const forceClipboard: boolean =
    context.workspaceState.get<boolean>(KEY_FORCE_CLIPBOARD, false);

  if (forceClipboard || defaultTarget === "clipboard") {
    await copyToClipboard(
      payload,
      `$(clippy) SelectBeam: copied ${relativePath} (lines ${startLine}-${endLine}) — clipboard-only mode`
    );
    return;
  }

  const openTerminals: readonly vscode.Terminal[] =
    vscode.window.terminals;

  // --- No terminal at all: offer to create one + launch, or clipboard. ---
  if (openTerminals.length === 0) {
    if (defaultTarget === "terminal") {
      // Strict mode still needs a terminal — create + launch instead of
      // erroring, since we can now bootstrap the agent ourselves.
      await createAndLaunchFlow(context, payload, relativePath, startLine, endLine);
      return;
    }
    // "auto": ask (launch) rather than silently copying — but keep a
    // clipboard escape hatch in the same picker.
    const launched: boolean = await createAndLaunchFlow(
      context, payload, relativePath, startLine, endLine
    );
    if (!launched) {
      // User picked clipboard inside the picker, or dismissed it.
      // createAndLaunchFlow already copied when clipboard was chosen.
    }
    return;
  }

  // --- Terminal(s) exist: pick target, then ensure agent before paste. ---
  const target: vscode.Terminal | undefined =
    await resolveTargetTerminal(context);
  if (!target) {
    return; // Esc
  }

  await ensureAgentAndPaste(
    context, target, payload, relativePath, startLine, endLine
  );
}

// ---------------------------------------------------------------------------
// No-terminal flow: pick destination (terminal agent | browser AI | clipb.)
// Returns true if something was sent/launched, false if user picked
// clipboard (already copied) or dismissed.
// ---------------------------------------------------------------------------
async function createAndLaunchFlow(
  context: vscode.ExtensionContext,
  payload: string,
  relativePath: string,
  startLine: number,
  endLine: number
): Promise<boolean> {
  const dest: DestinationPick | undefined = await pickDestination(
    "SelectBeam: no terminal open — launch a terminal agent, open a browser AI, or clipboard"
  );
  if (!dest) {
    return false;
  }
  if (dest.destKind === "clipboard") {
    await copyToClipboard(payload, "$(clippy) SelectBeam: copied — no terminal open");
    return false;
  }
  if (dest.destKind === "browser" && dest.browser) {
    await sendToBrowserTarget(
      context, dest.browser, payload, relativePath, startLine, endLine
    );
    return true;
  }

  // Terminal agent: create a dedicated terminal so we don't hijack other.
  const agent: AgentDef | undefined = dest.agent;
  if (!agent) {
    return false;
  }
  const terminal: vscode.Terminal = vscode.window.createTerminal(
    `SelectBeam: ${agent.id}`
  );
  await launchAgentAndPaste(
    context, terminal, agent, payload, relativePath, startLine, endLine
  );
  return true;
}

// ---------------------------------------------------------------------------
// Target terminal exists: if we previously launched an agent there, paste.
// Otherwise ask: "already running -> paste" vs "launch X now" vs clipboard.
// This is the guard that stops the `bquote>` bug (never paste ``` into a
// plain shell unasked).
// ---------------------------------------------------------------------------
async function ensureAgentAndPaste(
  context: vscode.ExtensionContext,
  target: vscode.Terminal,
  payload: string,
  relativePath: string,
  startLine: number,
  endLine: number
): Promise<void> {
  const knownAgentId: string | undefined = getAgentForTerminal(
    context,
    target.name
  );
  if (knownAgentId) {
    const agent: AgentDef | undefined = AGENTS.find(
      (a: AgentDef): boolean => a.id === knownAgentId
    );
    // Known agent terminal (still open) -> paste directly, no questions.
    await pasteWithOptionalPrompt(
      context, target,
      agent ? `(${agent.id}) ` : "",
      payload, relativePath, startLine, endLine
    );
    return;
  }

  interface EnsPick extends vscode.QuickPickItem {
    pickKind: "already" | "clipboard" | "agent" | "browser";
    agent?: AgentDef;
    browser?: BrowserDef;
  }

  const items: EnsPick[] = [
    {
      label: "$(check) Agent already running here — just paste",
      description: "Only choose this if your AI CLI prompt is visible",
      pickKind: "already",
    },
    ...AGENTS.map(
      (a: AgentDef): EnsPick => ({
        label: a.label,
        description: `${a.description} in "${target.name}"`,
        pickKind: "agent",
        agent: a,
      })
    ),
    ...BROWSERS.map(
      (b: BrowserDef): EnsPick => ({
        label: b.label,
        description: `${b.description} (copy + open browser)`,
        pickKind: "browser",
        browser: b,
      })
    ),
    {
      label: "$(clippy) Copy to clipboard instead",
      description: "Don't touch the terminal",
      pickKind: "clipboard",
    },
  ];

  const picked: EnsPick | undefined =
    await vscode.window.showQuickPick<EnsPick>(items, {
      placeHolder: `SelectBeam: "${target.name}" has no known AI agent — launch one or paste anyway?`,
    });
  if (!picked) {
    return;
  }

  if (picked.pickKind === "clipboard") {
    await copyToClipboard(
      payload,
      "$(clippy) SelectBeam: copied — terminal left untouched"
    );
    return;
  }

  if (picked.pickKind === "already") {
    // Trust the user; remember as generic ready so we don't ask again.
    // Stored as "external" (not in AGENTS) — paste path handles it.
    await setAgentForTerminal(context, target.name, "__external__");
    await pasteWithOptionalPrompt(
      context, target, "", payload, relativePath, startLine, endLine
    );
    return;
  }

  // Launch the chosen agent IN the existing target terminal.
  if (picked.pickKind === "agent") {
    if (!picked.agent) {
      return;
    }
    await launchAgentAndPaste(
      context, target, picked.agent, payload, relativePath, startLine, endLine
    );
    return;
  }

  // Browser AI: terminal left untouched — copy + open the chat site.
  if (picked.pickKind === "browser" && picked.browser) {
    await sendToBrowserTarget(
      context, picked.browser, payload, relativePath, startLine, endLine
    );
  }
}

// ---------------------------------------------------------------------------
// Launch + paste: sendText(cmd, true) to EXECUTE, wait for TUI startup,
// then paste code with sendText(payload, false) so it is NOT submitted.
// ---------------------------------------------------------------------------
async function launchAgentAndPaste(
  context: vscode.ExtensionContext,
  terminal: vscode.Terminal,
  agent: AgentDef,
  payload: string,
  relativePath: string,
  startLine: number,
  endLine: number
): Promise<void> {
  const config: vscode.WorkspaceConfiguration =
    vscode.workspace.getConfiguration("selectbeam");
  // Per-agent override, e.g. { "copilot": "gh copilot" }.
  const overrides: Record<string, string> =
    config.get<Record<string, string>>("agentCommands", {});
  const command: string = overrides[agent.id] ?? agent.defaultCommand;
  const delayMs: number = config.get<number>("agentStartDelayMs", 2000);

  try {
    terminal.show();
    // `true` = press Enter -> actually run the agent command in the shell.
    terminal.sendText(command, true);
    await setAgentForTerminal(context, terminal.name, agent.id);
    vscode.window.setStatusBarMessage(
      `$(sync~spin) SelectBeam: starting ${agent.id} in "${terminal.name}"…`,
      delayMs
    );
    // Give the TUI time to boot before we type into its prompt.
    await sleep(delayMs);
    await pasteWithOptionalPrompt(
      context, terminal, `(${agent.id}) `,
      payload, relativePath, startLine, endLine
    );
  } catch {
    await copyToClipboard(
      payload,
      "$(clippy) SelectBeam: could not launch agent — copied to clipboard instead"
    );
  }
}

// ---------------------------------------------------------------------------
// Paste step (shared): optionally ask for the user's instruction, append it,
// then sendText(final, false) + show(). NEVER auto-submits.
// ---------------------------------------------------------------------------
async function pasteWithOptionalPrompt(
  context: vscode.ExtensionContext,
  terminal: vscode.Terminal,
  agentTag: string,
  payload: string,
  relativePath: string,
  startLine: number,
  endLine: number
): Promise<void> {
  void context; // (reserved: per-terminal prompt memory, future use)
  const finalText: string = await withOptionalInstruction(
    relativePath, startLine, endLine, agentTag, payload
  );

  try {
    // `false` = do NOT press Enter. Code sits in the agent's prompt;
    // the user reviews, optionally types more, then submits manually.
    terminal.sendText(finalText, false);
    terminal.show();
    vscode.window.setStatusBarMessage(
      `$(terminal) SelectBeam: pasted ${relativePath} (lines ${startLine}-${endLine}) ${agentTag}in "${terminal.name}" — review & press Enter`,
      3000
    );
  } catch {
    await copyToClipboard(
      payload,
      "$(clippy) SelectBeam: terminal paste failed — copied to clipboard instead"
    );
  }
}

// ---------------------------------------------------------------------------
// Shared prompt step: optionally ask for the user's instruction and append
// it after the code block. Empty / Esc = code only. Never auto-submits.
// ---------------------------------------------------------------------------
async function withOptionalInstruction(
  relativePath: string,
  startLine: number,
  endLine: number,
  agentTag: string,
  payload: string
): Promise<string> {
  const config: vscode.WorkspaceConfiguration =
    vscode.workspace.getConfiguration("selectbeam");
  const askForPrompt: boolean = config.get<boolean>("askForPrompt", true);

  if (!askForPrompt) {
    return payload;
  }
  // Empty / Esc = code only. The agent waits for the user either way —
  // we never press Enter after pasting.
  const instruction: string | undefined =
    await vscode.window.showInputBox({
      placeHolder: "Optional instruction for the AI (Enter = code only, Esc = code only)",
      prompt: `SelectBeam: what should ${agentTag || "the AI"}do with ${relativePath} (lines ${startLine}-${endLine})?`,
    });
  if (instruction && instruction.trim().length > 0) {
    return `${payload}\n\n${instruction.trim()}\n`;
  }
  return payload;
}

// ---------------------------------------------------------------------------
// Unified destination picker: terminal agents + browser AIs + clipboard.
// Used when no terminal exists (create flow). Kept separate from the
// terminal-guard picker above so each ask fits its context.
// ---------------------------------------------------------------------------
interface DestinationPick extends vscode.QuickPickItem {
  destKind: "agent" | "browser" | "clipboard";
  agent?: AgentDef;
  browser?: BrowserDef;
}

async function pickDestination(
  placeHolder: string
): Promise<DestinationPick | undefined> {
  const items: DestinationPick[] = [
    ...AGENTS.map(
      (a: AgentDef): DestinationPick => ({
        label: a.label,
        description: a.description,
        destKind: "agent",
        agent: a,
      })
    ),
    ...BROWSERS.map(
      (b: BrowserDef): DestinationPick => ({
        label: b.label,
        description: `${b.description} (copy + open browser)`,
        destKind: "browser",
        browser: b,
      })
    ),
    {
      label: "$(clippy) Clipboard only",
      description: "Just copy, don't open anything",
      destKind: "clipboard",
    },
  ];
  return vscode.window.showQuickPick<DestinationPick>(items, { placeHolder });
}

// ---------------------------------------------------------------------------
// Browser command: `selectbeam.sendToBrowser` — copy payload, open the chat
// site, user pastes once. Honors `selectbeam.defaultBrowser` ("ask" | "last"
// | specific id) and remembers the pick for "last" mode.
// ---------------------------------------------------------------------------
async function sendToBrowser(
  context: vscode.ExtensionContext
): Promise<void> {
  const editor: vscode.TextEditor | undefined =
    vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showWarningMessage("SelectBeam: No active editor.");
    return;
  }
  if (editor.selection.isEmpty) {
    void vscode.window.showWarningMessage(
      "SelectBeam: Select some code first."
    );
    return;
  }

  const { payload, relativePath, startLine, endLine } =
    buildPayload(editor);

  const browser: BrowserDef | "clipboard" | undefined =
    await resolveBrowser(context);
  if (!browser) {
    return; // Esc
  }
  if (browser === "clipboard") {
    await copyToClipboard(
      payload,
      `$(clippy) SelectBeam: copied ${relativePath} (lines ${startLine}-${endLine})`
    );
    return;
  }
  await sendToBrowserTarget(
    context, browser, payload, relativePath, startLine, endLine
  );
}

// Resolve which browser AI to use: explicit default -> use it; "last" ->
// reuse remembered pick (or ask); "ask" -> picker with clipboard fallback.
async function resolveBrowser(
  context: vscode.ExtensionContext
): Promise<BrowserDef | "clipboard" | undefined> {
  const config: vscode.WorkspaceConfiguration =
    vscode.workspace.getConfiguration("selectbeam");
  const defaultBrowser: DefaultBrowser = config.get<DefaultBrowser>(
    "defaultBrowser",
    "ask"
  );

  if (defaultBrowser !== "ask" && defaultBrowser !== "last") {
    const fixed: BrowserDef | undefined = BROWSERS.find(
      (b: BrowserDef): boolean => b.id === defaultBrowser
    );
    if (fixed) {
      return fixed;
    }
    // Unknown id (e.g. after an update) — fall through to the picker.
  }

  if (defaultBrowser === "last") {
    const lastId: string | undefined = context.workspaceState.get<
      string | undefined
    >(KEY_LAST_BROWSER);
    if (lastId) {
      const last: BrowserDef | undefined = BROWSERS.find(
        (b: BrowserDef): boolean => b.id === lastId
      );
      if (last) {
        return last;
      }
    }
  }

  interface BrowserPick extends vscode.QuickPickItem {
    pickKind: "browser" | "clipboard";
    browser?: BrowserDef;
  }
  const items: BrowserPick[] = [
    ...BROWSERS.map(
      (b: BrowserDef): BrowserPick => ({
        label: b.label,
        description: b.description,
        pickKind: "browser",
        browser: b,
      })
    ),
    {
      label: "$(clippy) Clipboard only",
      description: "Just copy, don't open a browser",
      pickKind: "clipboard",
    },
  ];
  const picked: BrowserPick | undefined =
    await vscode.window.showQuickPick<BrowserPick>(items, {
      placeHolder: "SelectBeam: pick a browser AI (code is copied — paste once with Ctrl+V)",
    });
  if (!picked) {
    return undefined;
  }
  if (picked.pickKind === "clipboard") {
    return "clipboard";
  }
  await rememberBrowser(context, picked.browser!.id);
  return picked.browser!;
}

async function rememberBrowser(
  context: vscode.ExtensionContext,
  browserId: string
): Promise<void> {
  const config: vscode.WorkspaceConfiguration =
    vscode.workspace.getConfiguration("selectbeam");
  const remember: boolean = config.get<boolean>(
    "rememberBrowserChoice",
    true
  );
  if (remember) {
    await context.workspaceState.update(KEY_LAST_BROWSER, browserId);
  }
}

function getBrowserUrl(
  browser: BrowserDef
): string {
  const config: vscode.WorkspaceConfiguration =
    vscode.workspace.getConfiguration("selectbeam");
  const overrides: Record<string, string> =
    config.get<Record<string, string>>("browserUrls", {});
  const override: string | undefined = overrides[browser.id];
  if (override && override.trim().length > 0) {
    return override.trim();
  }
  return browser.defaultUrl;
}

// Copy (+ optional instruction), then open the chat URL. VS Code cannot
// paste into the browser for us, so the info message reminds the user to
// press Ctrl/Cmd+V once. Failures fall back to clipboard-only.
async function sendToBrowserTarget(
  context: vscode.ExtensionContext,
  browser: BrowserDef,
  payload: string,
  relativePath: string,
  startLine: number,
  endLine: number
): Promise<void> {
  await rememberBrowser(context, browser.id);
  const finalText: string = await withOptionalInstruction(
    relativePath, startLine, endLine, `${browser.id} `, payload
  );

  await vscode.env.clipboard.writeText(finalText);
  const url: string = getBrowserUrl(browser);
  try {
    const uri: vscode.Uri = vscode.Uri.parse(url);
    const opened: boolean = await vscode.env.openExternal(uri);
    if (opened) {
      void vscode.window.showInformationMessage(
        `SelectBeam: ${relativePath} (lines ${startLine}-${endLine}) copied — paste once (Ctrl+V) in ${browser.id}.`,
        "Copy again"
      ).then(async (action: string | undefined): Promise<void> => {
        if (action === "Copy again") {
          await vscode.env.clipboard.writeText(finalText);
        }
      });
      vscode.window.setStatusBarMessage(
        `$(globe) SelectBeam: opened ${browser.id} — code is in your clipboard, press Ctrl+V there`,
        5000
      );
    } else {
      vscode.window.setStatusBarMessage(
        "$(clippy) SelectBeam: browser would not open — code copied to clipboard instead",
        3000
      );
    }
  } catch {
    vscode.window.setStatusBarMessage(
      "$(clippy) SelectBeam: could not open browser — code copied to clipboard instead",
      3000
    );
  }
}

// ---------------------------------------------------------------------------
// Terminal resolution: remembered -> single -> quickpick (unchanged logic).
// ---------------------------------------------------------------------------
async function resolveTargetTerminal(
  context: vscode.ExtensionContext
): Promise<vscode.Terminal | undefined> {
  const openTerminals: readonly vscode.Terminal[] =
    vscode.window.terminals;
  if (openTerminals.length === 0) {
    return undefined;
  }
  const config: vscode.WorkspaceConfiguration =
    vscode.workspace.getConfiguration("selectbeam");
  const remember: boolean = config.get<boolean>(
    "rememberTerminalChoice",
    true
  );

  const rememberedName: string | undefined = context.workspaceState.get<
    string | undefined
  >(KEY_REMEMBERED_TERMINAL);
  if (rememberedName) {
    const stillOpen: vscode.Terminal | undefined = openTerminals.find(
      (t: vscode.Terminal): boolean => t.name === rememberedName
    );
    if (stillOpen) {
      return stillOpen;
    }
    await context.workspaceState.update(KEY_REMEMBERED_TERMINAL, undefined);
  }

  if (openTerminals.length === 1) {
    const only: vscode.Terminal =
      vscode.window.activeTerminal ?? openTerminals[0]!;
    if (remember) {
      await context.workspaceState.update(
        KEY_REMEMBERED_TERMINAL,
        only.name
      );
    }
    return only;
  }

  const pickedName: string | undefined =
    await vscode.window.showQuickPick(
      openTerminals.map((t: vscode.Terminal): string => t.name),
      {
        placeHolder:
          "SelectBeam: pick the terminal (Claude Code, Copilot CLI, Codex, OpenCode, aider, …)",
      }
    );
  if (!pickedName) {
    return undefined;
  }
  const picked: vscode.Terminal | undefined = openTerminals.find(
    (t: vscode.Terminal): boolean => t.name === pickedName
  );
  if (picked && remember) {
    await context.workspaceState.update(
      KEY_REMEMBERED_TERMINAL,
      picked.name
    );
  }
  return picked;
}

// ---------------------------------------------------------------------------
// chooseTarget: reset Auto / clipboard-only / pin a terminal.
// Auto also clears the agent map so the next send re-verifies the agent.
// ---------------------------------------------------------------------------
async function chooseTarget(
  context: vscode.ExtensionContext
): Promise<void> {
  const openTerminals: readonly vscode.Terminal[] =
    vscode.window.terminals;

  interface TargetPick extends vscode.QuickPickItem {
    targetKind: "auto" | "clipboard" | "terminal";
    terminalName?: string;
  }

  const items: TargetPick[] = [
    {
      label: "$(zap) Auto (terminal first, clipboard fallback)",
      description: "Clear saved choice + agent memory + last browser",
      targetKind: "auto",
    },
    {
      label: "$(clippy) Clipboard only (this session)",
      description: "Never send to terminal until reset",
      targetKind: "clipboard",
    },
  ];
  for (const t of openTerminals) {
    items.push({
      label: `$(terminal) ${t.name}`,
      description: "Send future snippets here",
      targetKind: "terminal",
      terminalName: t.name,
    });
  }

  const picked: TargetPick | undefined =
    await vscode.window.showQuickPick<TargetPick>(items, {
      placeHolder:
        openTerminals.length === 0
          ? "SelectBeam: no terminals open — pick clipboard or auto"
          : "SelectBeam: choose send target",
    });
  if (!picked) {
    return;
  }

  if (picked.targetKind === "auto") {
    await context.workspaceState.update(
      KEY_REMEMBERED_TERMINAL,
      undefined
    );
    await context.workspaceState.update(KEY_FORCE_CLIPBOARD, false);
    await context.workspaceState.update(KEY_AGENT_MAP, undefined);
    await context.workspaceState.update(KEY_LAST_BROWSER, undefined);
    vscode.window.setStatusBarMessage(
      "$(zap) SelectBeam: target reset to Auto",
      2000
    );
  } else if (picked.targetKind === "clipboard") {
    await context.workspaceState.update(KEY_FORCE_CLIPBOARD, true);
    vscode.window.setStatusBarMessage(
      "$(clippy) SelectBeam: clipboard-only mode for this session",
      2000
    );
  } else if (picked.targetKind === "terminal" && picked.terminalName) {
    await context.workspaceState.update(
      KEY_REMEMBERED_TERMINAL,
      picked.terminalName
    );
    await context.workspaceState.update(KEY_FORCE_CLIPBOARD, false);
    vscode.window.setStatusBarMessage(
      `$(terminal) SelectBeam: will send to "${picked.terminalName}"`,
      2000
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface Payload {
  payload: string;
  relativePath: string;
  startLine: number;
  endLine: number;
}

function buildPayload(editor: vscode.TextEditor): Payload {
  const selection: vscode.Selection = editor.selection;
  const selectedText: string = editor.document.getText(selection);
  const relativePath: string = vscode.workspace.asRelativePath(
    editor.document.uri
  );
  const startLine: number = selection.start.line + 1;
  const endLine: number = selection.end.line + 1;
  const fenceLang: string = editor.document.languageId ?? "";

  const payload: string =
    `\`\`\`${fenceLang}\n` +
    `// ${relativePath} (lines ${startLine}-${endLine})\n` +
    `${selectedText}\n` +
    `\`\`\``;

  return { payload, relativePath, startLine, endLine };
}

async function copyToClipboard(
  payload: string,
  statusMessage: string
): Promise<void> {
  await vscode.env.clipboard.writeText(payload);
  vscode.window.setStatusBarMessage(statusMessage, 3000);
}

function getAgentMap(
  context: vscode.ExtensionContext
): Record<string, string> {
  return context.workspaceState.get<Record<string, string>>(
    KEY_AGENT_MAP,
    {}
  );
}

function getAgentForTerminal(
  context: vscode.ExtensionContext,
  terminalName: string
): string | undefined {
  return getAgentMap(context)[terminalName];
}

async function setAgentForTerminal(
  context: vscode.ExtensionContext,
  terminalName: string,
  agentId: string
): Promise<void> {
  const map: Record<string, string> = { ...getAgentMap(context) };
  map[terminalName] = agentId;
  await context.workspaceState.update(KEY_AGENT_MAP, map);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve: () => void): void => {
    setTimeout(resolve, ms);
  });
}

export function deactivate(): void {}
