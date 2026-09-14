// CodeBeam — V1: copy the current selection as a markdown code block.
//
// What this file does:
// - `activate()` runs once when VS Code loads the extension (lazily, on
//   our command — see "activationEvents" in package.json).
// - It registers the `codebeam.sendSelection` command.
// - When triggered, we read the active editor's selection, wrap it in a
//   markdown fence with a `// path (lines X-Y)` header, copy it to the
//   clipboard, and flash a status-bar confirmation for ~2s.
//
// VS Code API concepts used here (for learning):
// - `vscode.window.activeTextEditor` — the currently focused editor, if any.
// - `editor.selection` — the highlighted range; `document.getText(range)`.
// - `vscode.workspace.asRelativePath(uri)` — workspace-relative path.
// - `vscode.env.clipboard.writeText()` — writes to the OS clipboard.
// - `vscode.window.setStatusBarMessage(text, timeoutMs)` — transient message.
// - `context.subscriptions` — disposables VS Code cleans up on deactivate.

import * as vscode from "vscode";

// Called once by VS Code when the extension is activated.
// `context` lets us register disposables (commands, listeners, etc.).
export function activate(context: vscode.ExtensionContext): void {
  // Register our one V1 command. The command id MUST match the id in
  // package.json -> contributes.commands / keybindings / menus.
  const disposable: vscode.Disposable = vscode.commands.registerCommand(
    "codebeam.sendSelection",
    async (): Promise<void> => {
      await sendSelectionToClipboard();
    }
  );

  // Push to subscriptions so VS Code disposes it on deactivate/uninstall.
  context.subscriptions.push(disposable);
}

// Core V1 logic: format selection -> clipboard -> status-bar confirmation.
async function sendSelectionToClipboard(): Promise<void> {
  // 1. Guard: no open editor at all (e.g. focus is in the sidebar).
  const editor: vscode.TextEditor | undefined =
    vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showWarningMessage(
      "CodeBeam: No active editor. Open a file and select some code first."
    );
    return;
  }

  // 2. Guard: editor is open but nothing is highlighted.
  //    `selection.isEmpty` is true when it's just a blinking cursor.
  const selection: vscode.Selection = editor.selection;
  if (selection.isEmpty) {
    void vscode.window.showWarningMessage(
      "CodeBeam: No text selected. Highlight some code, then run CodeBeam again."
    );
    return;
  }

  // 3. Extract the selected text for the exact highlighted range.
  const selectedText: string = editor.document.getText(selection);

  // 4. Build a helpful header: relative path + 1-based line numbers.
  //    VS Code lines are 0-based internally, so add 1 for humans.
  //    Example: `// src/extension.ts (lines 12-24)`
  const relativePath: string = vscode.workspace.asRelativePath(
    editor.document.uri
  );
  const startLine: number = selection.start.line + 1;
  const endLine: number = selection.end.line + 1;

  // 5. Use the editor's language id as the markdown fence tag so pasted
  //    code keeps syntax highlighting in ChatGPT/Claude/etc.
  //    Example: typescript, python, rust. Falls back to "" if unknown.
  const fenceLang: string = editor.document.languageId ?? "";

  // 6. Assemble the final markdown payload.
  const payload: string =
    `\`\`\`${fenceLang}\n` +
    `// ${relativePath} (lines ${startLine}-${endLine})\n` +
    `${selectedText}\n` +
    `\`\`\``;

  // 7. Copy to the OS clipboard so the user can paste into any AI tool.
  await vscode.env.clipboard.writeText(payload);

  // 8. Brief confirmation in the status bar (auto-hides after ~2s).
  //    We include the path + line range so it's clear WHAT was copied.
  vscode.window.setStatusBarMessage(
    `$(check) CodeBeam: copied ${relativePath} (lines ${startLine}-${endLine}) — paste into your AI tool`,
    2000
  );
}

// Called when the extension is deactivated (e.g. VS Code shuts down).
// Nothing to clean up in V1 beyond `context.subscriptions` (auto-disposed).
export function deactivate(): void {}
