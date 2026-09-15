import * as vscode from "vscode";
import { getAskForPrompt } from "./config";

export interface Payload {
  payload: string;
  relativePath: string;
  startLine: number;
  endLine: number;
}

export function buildPayload(editor: vscode.TextEditor): Payload {
  const selection: vscode.Selection = editor.selection;
  const selectedText: string = editor.document.getText(selection);
  const relativePath: string = vscode.workspace.asRelativePath(editor.document.uri);
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

export async function copyToClipboard(payload: string, statusMessage: string): Promise<void> {
  await vscode.env.clipboard.writeText(payload);
  vscode.window.setStatusBarMessage(statusMessage, 3000);
}

export async function withOptionalInstruction(
  relativePath: string,
  startLine: number,
  endLine: number,
  agentTag: string,
  payload: string
): Promise<string> {
  if (!getAskForPrompt()) {
    return payload;
  }
  const instruction: string | undefined = await vscode.window.showInputBox({
    placeHolder: "Optional instruction for the AI (Enter = code only, Esc = code only)",
    prompt: `SelectBeam: what should ${agentTag || "the AI"}do with ${relativePath} (lines ${startLine}-${endLine})?`,
  });
  return instruction && instruction.trim().length > 0 ? `${payload}\n\n${instruction.trim()}\n` : payload;
}
