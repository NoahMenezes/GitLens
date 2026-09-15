import * as vscode from "vscode";
import { getDefaultTarget } from "./config";
import { buildPayload, copyToClipboard } from "./payload";
import {
  clearAgentMap,
  clearLiveTabs,
  isForceClipboard,
  setForceClipboard,
  setLastBrowserId,
  setLastSystemBrowserId,
  setRememberedTerminal,
} from "./state";
import { clearPendingQueue } from "./bridge";
import { createAndLaunchFlow, ensureAgentAndPaste, resolveTargetTerminal } from "./terminal";

async function needSelection(): Promise<{ payload: string; relativePath: string; startLine: number; endLine: number } | undefined> {
  const editor: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showWarningMessage("SelectBeam: No active editor.");
    return undefined;
  }
  if (editor.selection.isEmpty) {
    void vscode.window.showWarningMessage("SelectBeam: Select some code first.");
    return undefined;
  }
  return buildPayload(editor);
}

export async function sendSelection(context: vscode.ExtensionContext): Promise<void> {
  const sel = await needSelection();
  if (!sel) {
    return;
  }
  const { payload, relativePath, startLine, endLine } = sel;
  if (isForceClipboard(context) || getDefaultTarget() === "clipboard") {
    await copyToClipboard(
      payload,
      `$(clippy) SelectBeam: copied ${relativePath} (lines ${startLine}-${endLine}) — clipboard-only mode`
    );
    return;
  }
  if (vscode.window.terminals.length === 0) {
    await createAndLaunchFlow(context, payload, relativePath, startLine, endLine);
    return;
  }
  const target: vscode.Terminal | undefined = await resolveTargetTerminal(context);
  if (!target) {
    return;
  }
  await ensureAgentAndPaste(context, target, payload, relativePath, startLine, endLine);
}

export async function chooseTarget(context: vscode.ExtensionContext): Promise<void> {
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
    ...openTerminals.map(
      (t): TargetPick => ({
        label: `$(terminal) ${t.name}`,
        description: "Send future snippets here",
        targetKind: "terminal",
        terminalName: t.name,
      })
    ),
  ];
  const picked: TargetPick | undefined = await vscode.window.showQuickPick<TargetPick>(items, {
    placeHolder:
      openTerminals.length === 0 ? "SelectBeam: no terminals open — pick clipboard or auto" : "SelectBeam: choose send target",
  });
  if (!picked) {
    return;
  }
  if (picked.targetKind === "auto") {
    await setRememberedTerminal(context, undefined);
    await setForceClipboard(context, false);
    await clearAgentMap(context);
    await setLastBrowserId(context, undefined);
    await setLastSystemBrowserId(context, undefined);
    await clearLiveTabs(context);
    clearPendingQueue();
    vscode.window.setStatusBarMessage("$(zap) SelectBeam: target reset to Auto", 2000);
  } else if (picked.targetKind === "clipboard") {
    await setForceClipboard(context, true);
    vscode.window.setStatusBarMessage("$(clippy) SelectBeam: clipboard-only mode for this session", 2000);
  } else if (picked.targetKind === "terminal" && picked.terminalName) {
    await setRememberedTerminal(context, picked.terminalName);
    await setForceClipboard(context, false);
    vscode.window.setStatusBarMessage(`$(terminal) SelectBeam: will send to "${picked.terminalName}"`, 2000);
  }
}
