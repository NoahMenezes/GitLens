// SelectBeam — terminal send path: target resolution, agent guard, launch.
// The agent guard is what stops the `bquote>` bug: we never paste a ```
// fence into a plain shell unasked.

import * as vscode from "vscode";
import { AGENTS, BROWSERS } from "./constants";
import {
  getAgentStartDelayMs,
  getAgentCommands,
  getRememberTerminalChoice,
} from "./config";
import { sleep } from "./platform";
import { copyToClipboard, withOptionalInstruction } from "./payload";
import {
  getAgentForTerminal,
  getRememberedTerminal,
  setAgentForTerminal,
  setRememberedTerminal,
} from "./state";
import { sendToBrowserTarget } from "./browserSend";
import type { AgentDef, BrowserDef, DestinationPick } from "./types";

// --- Target resolution: remembered -> single -> quickpick ------------------

export async function resolveTargetTerminal(
  context: vscode.ExtensionContext
): Promise<vscode.Terminal | undefined> {
  const openTerminals: readonly vscode.Terminal[] = vscode.window.terminals;
  if (openTerminals.length === 0) {
    return undefined;
  }
  const remember: boolean = getRememberTerminalChoice();

  const rememberedName = getRememberedTerminal(context);
  if (rememberedName) {
    const stillOpen = openTerminals.find(
      (t: vscode.Terminal): boolean => t.name === rememberedName
    );
    if (stillOpen) {
      return stillOpen;
    }
    await setRememberedTerminal(context, undefined);
  }

  if (openTerminals.length === 1) {
    const only: vscode.Terminal =
      vscode.window.activeTerminal ?? openTerminals[0]!;
    if (remember) {
      await setRememberedTerminal(context, only.name);
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
  const picked = openTerminals.find(
    (t: vscode.Terminal): boolean => t.name === pickedName
  );
  if (picked && remember) {
    await setRememberedTerminal(context, picked.name);
  }
  return picked;
}

// --- No-terminal flow -------------------------------------------------------
// Pick destination (terminal agent | browser AI | clipboard).
// Returns true if something was sent/launched, false if the user picked
// clipboard (already copied) or dismissed.

export async function createAndLaunchFlow(
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

// --- Agent guard + launch ---------------------------------------------------
// Target terminal exists: if we previously launched an agent there, paste.
// Otherwise ask: "already running -> paste" vs "launch X now" vs clipboard.

export async function ensureAgentAndPaste(
  context: vscode.ExtensionContext,
  target: vscode.Terminal,
  payload: string,
  relativePath: string,
  startLine: number,
  endLine: number
): Promise<void> {
  const knownAgentId = getAgentForTerminal(context, target.name);
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

// Launch + paste: sendText(cmd, true) to EXECUTE, wait for TUI startup,
// then paste code with sendText(payload, false) so it is NOT submitted.
export async function launchAgentAndPaste(
  context: vscode.ExtensionContext,
  terminal: vscode.Terminal,
  agent: AgentDef,
  payload: string,
  relativePath: string,
  startLine: number,
  endLine: number
): Promise<void> {
  // Per-agent override, e.g. { "copilot": "gh copilot" }.
  const overrides: Record<string, string> = getAgentCommands();
  const command: string = overrides[agent.id] ?? agent.defaultCommand;
  const delayMs: number = getAgentStartDelayMs();

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

// Paste step (shared): optionally ask for the user's instruction, append it,
// then sendText(final, false) + show(). NEVER auto-submits.
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
