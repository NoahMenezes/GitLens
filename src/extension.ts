// CodeBeam — terminal-first send with agent auto-launch.
//
// Flow:
// - `codebeam.sendSelection` formats the selection as markdown, resolves a
//   target terminal, then makes sure an AI CLI is running there BEFORE
//   pasting. We never blind-paste a ``` fence into a plain shell (that is
//   what caused the `bquote>` mess in zsh — backticks start command
//   substitution, so the shell waits for a closing backtick).
// - If no terminal exists, or the target looks like a plain shell (we did
//   not launch an agent there), we show a QuickPick:
//     OpenCode / Claude Code / Codex / Copilot CLI / aider / Clipboard.
//   Picking an agent auto-launches it (`sendText(cmd, true)` to press
//   Enter), waits `agentStartDelayMs`, then pastes the code with
//   `sendText(payload, false)` (false = do NOT press Enter — user reviews
//   and submits manually). An optional input box collects the user's
//   instruction to append after the code.
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
const KEY_REMEMBERED_TERMINAL = "codebeam.rememberedTerminalName";
// Session pin for clipboard-only (set via chooseTarget).
const KEY_FORCE_CLIPBOARD = "codebeam.forceClipboard";
// Terminal name -> agent id we launched there (e.g. { "pwsh": "opencode" }).
// Absence means "unknown / probably plain shell" -> we ask before pasting.
const KEY_AGENT_MAP = "codebeam.terminalAgents";

type DefaultTarget = "auto" | "clipboard" | "terminal";

interface AgentDef {
  id: string;
  label: string;
  description: string;
  // Default launch command; overridable via `codebeam.agentCommands`.
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

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "codebeam.sendSelection",
      async (): Promise<void> => sendSelection(context)
    ),
    vscode.commands.registerCommand(
      "codebeam.chooseTarget",
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
    void vscode.window.showWarningMessage("CodeBeam: No active editor.");
    return;
  }
  if (editor.selection.isEmpty) {
    void vscode.window.showWarningMessage(
      "CodeBeam: Select some code first."
    );
    return;
  }

  const { payload, relativePath, startLine, endLine } =
    buildPayload(editor);

  const config: vscode.WorkspaceConfiguration =
    vscode.workspace.getConfiguration("codebeam");
  const defaultTarget: DefaultTarget = config.get<DefaultTarget>(
    "defaultTarget",
    "auto"
  );
  const forceClipboard: boolean =
    context.workspaceState.get<boolean>(KEY_FORCE_CLIPBOARD, false);

  if (forceClipboard || defaultTarget === "clipboard") {
    await copyToClipboard(
      payload,
      `$(clippy) CodeBeam: copied ${relativePath} (lines ${startLine}-${endLine}) — clipboard-only mode`
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
// No-terminal flow: pick agent -> create terminal -> launch -> paste.
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
  const agent: AgentDef | "clipboard" | undefined =
    await pickAgent("CodeBeam: no terminal open — pick an AI agent to launch, or clipboard");
  if (!agent) {
    return false;
  }
  if (agent === "clipboard") {
    await copyToClipboard(payload, "$(clippy) CodeBeam: copied — no terminal open");
    return false;
  }

  // Create a dedicated terminal so we don't hijack something else.
  const terminal: vscode.Terminal = vscode.window.createTerminal(
    `CodeBeam: ${agent.id}`
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
    pickKind: "already" | "clipboard" | "agent";
    agent?: AgentDef;
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
    {
      label: "$(clippy) Copy to clipboard instead",
      description: "Don't touch the terminal",
      pickKind: "clipboard",
    },
  ];

  const picked: EnsPick | undefined =
    await vscode.window.showQuickPick<EnsPick>(items, {
      placeHolder: `CodeBeam: "${target.name}" has no known AI agent — launch one or paste anyway?`,
    });
  if (!picked) {
    return;
  }

  if (picked.pickKind === "clipboard") {
    await copyToClipboard(
      payload,
      "$(clippy) CodeBeam: copied — terminal left untouched"
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
  await launchAgentAndPaste(
    context, target, picked.agent!, payload, relativePath, startLine, endLine
  );
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
    vscode.workspace.getConfiguration("codebeam");
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
      `$(sync~spin) CodeBeam: starting ${agent.id} in "${terminal.name}"…`,
      delayMs
    );
    // Give the TUI time to boot before we type into its prompt.
    await sleep(delayMs);
    await pasteWithOptionalPrompt(
      context, terminal, `(${agent.id}) `,
      payload, relativePath, startLine, endLine
    );
  } catch (err) {
    await copyToClipboard(
      payload,
      "$(clippy) CodeBeam: could not launch agent — copied to clipboard instead"
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
  const config: vscode.WorkspaceConfiguration =
    vscode.workspace.getConfiguration("codebeam");
  const askForPrompt: boolean = config.get<boolean>("askForPrompt", true);

  let finalText: string = payload;
  if (askForPrompt) {
    // Empty / Esc = code only. The agent waits for the user either way —
    // we never press Enter after pasting.
    const instruction: string | undefined =
      await vscode.window.showInputBox({
        placeHolder: "Optional instruction for the AI (Enter = code only, Esc = code only)",
        prompt: `CodeBeam: what should ${agentTag || "the agent"}do with ${relativePath} (lines ${startLine}-${endLine})?`,
      });
    if (instruction && instruction.trim().length > 0) {
      finalText = `${payload}\n\n${instruction.trim()}\n`;
    }
  }

  try {
    // `false` = do NOT press Enter. Code sits in the agent's prompt;
    // the user reviews, optionally types more, then submits manually.
    terminal.sendText(finalText, false);
    terminal.show();
    vscode.window.setStatusBarMessage(
      `$(terminal) CodeBeam: pasted ${relativePath} (lines ${startLine}-${endLine}) ${agentTag}in "${terminal.name}" — review & press Enter`,
      3000
    );
  } catch (err) {
    await copyToClipboard(
      payload,
      "$(clippy) CodeBeam: terminal paste failed — copied to clipboard instead"
    );
  }
}

// ---------------------------------------------------------------------------
// Agent picker used when no terminal exists.
// ---------------------------------------------------------------------------
async function pickAgent(
  placeHolder: string
): Promise<AgentDef | "clipboard" | undefined> {
  interface AgentPick extends vscode.QuickPickItem {
    pickKind: "agent" | "clipboard";
    agent?: AgentDef;
  }
  const items: AgentPick[] = [
    ...AGENTS.map(
      (a: AgentDef): AgentPick => ({
        label: a.label,
        description: a.description,
        pickKind: "agent",
        agent: a,
      })
    ),
    {
      label: "$(clippy) Clipboard only",
      description: "Just copy, don't open anything",
      pickKind: "clipboard",
    },
  ];
  const picked: AgentPick | undefined =
    await vscode.window.showQuickPick<AgentPick>(items, { placeHolder });
  if (!picked) {
    return undefined;
  }
  if (picked.pickKind === "clipboard") {
    return "clipboard";
  }
  return picked.agent!;
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
    vscode.workspace.getConfiguration("codebeam");
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
          "CodeBeam: pick the terminal (Claude Code, Copilot CLI, Codex, OpenCode, aider, …)",
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
      description: "Clear saved choice + agent memory",
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
          ? "CodeBeam: no terminals open — pick clipboard or auto"
          : "CodeBeam: choose send target",
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
    vscode.window.setStatusBarMessage(
      "$(zap) CodeBeam: target reset to Auto",
      2000
    );
  } else if (picked.targetKind === "clipboard") {
    await context.workspaceState.update(KEY_FORCE_CLIPBOARD, true);
    vscode.window.setStatusBarMessage(
      "$(clippy) CodeBeam: clipboard-only mode for this session",
      2000
    );
  } else if (picked.targetKind === "terminal" && picked.terminalName) {
    await context.workspaceState.update(
      KEY_REMEMBERED_TERMINAL,
      picked.terminalName
    );
    await context.workspaceState.update(KEY_FORCE_CLIPBOARD, false);
    vscode.window.setStatusBarMessage(
      `$(terminal) CodeBeam: will send to "${picked.terminalName}"`,
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
