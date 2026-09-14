// SelectBeam — palette commands: sendSelection orchestration + chooseTarget.
// Thin glue over terminal.ts / browserSend.ts / bridge.ts.

import * as vscode from "vscode";
import { getDefaultTarget } from "./config";
import { buildPayload, copyToClipboard } from "./payload";
import {
  clearAgentMap,
  isForceClipboard,
  setForceClipboard,
  setLastBrowserId,
  setRememberedTerminal,
  clearLiveTabs,
} from "./state";
import { clearPendingQueue } from "./bridge";
import {
  createAndLaunchFlow,
  ensureAgentAndPaste,
  resolveTargetTerminal,
} from "./terminal";

// `selectbeam.sendSelection` — terminal-first. Clipboard-only modes copy.
// No terminal -> destination picker. Terminal(s) -> resolve + agent guard.
export async function sendSelection(
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

  const defaultTarget = getDefaultTarget();
  if (isForceClipboard(context) || defaultTarget === "clipboard") {
    await copyToClipboard(
      payload,
      `$(clippy) SelectBeam: copied ${relativePath} (lines ${startLine}-${endLine}) — clipboard-only mode`
    );
    return;
  }

  const openTerminals: readonly vscode.Terminal[] = vscode.window.terminals;

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
    await createAndLaunchFlow(context, payload, relativePath, startLine, endLine);
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

// `selectbeam.chooseTarget` — reset Auto / clipboard-only / pin a terminal.
// Auto also clears the agent map + live tabs + bridge queue so the next
// send re-verifies everything.
export async function chooseTarget(
  context: vscode.ExtensionContext
): Promise<void> {
  const openTerminals: readonly vscode.Terminal[] = vscode.window.terminals;

  interface TargetPick extends vscode.QuickPickItem {
    targetKind: "auto" | "clipboard" | "terminal";
    terminalName?: string;
  }

  const items: TargetPick[] = [
    {
      label: "$(zap) Auto (terminal first, clipboard fallback)",
      description: "Clear saved choice + agent memory + last browser + live tabs",
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
    await setRememberedTerminal(context, undefined);
    await setForceClipboard(context, false);
    await clearAgentMap(context);
    await setLastBrowserId(context, undefined);
    await clearLiveTabs(context);
    clearPendingQueue();
    vscode.window.setStatusBarMessage(
      "$(zap) SelectBeam: target reset to Auto",
      2000
    );
  } else if (picked.targetKind === "clipboard") {
    await setForceClipboard(context, true);
    vscode.window.setStatusBarMessage(
      "$(clippy) SelectBeam: clipboard-only mode for this session",
      2000
    );
  } else if (picked.targetKind === "terminal" && picked.terminalName) {
    await setRememberedTerminal(context, picked.terminalName);
    await setForceClipboard(context, false);
    vscode.window.setStatusBarMessage(
      `$(terminal) SelectBeam: will send to "${picked.terminalName}"`,
      2000
    );
  }
}
