// CodeBeam — Group A: terminal-first send with clipboard fallback.
//
// What this file does:
// - `activate()` registers two commands:
//     - `codebeam.sendSelection` — format selection -> send to a VS Code
//       terminal running an AI CLI (Claude Code, Copilot CLI, Codex,
//       OpenCode, aider, ...) or fall back to the clipboard.
//     - `codebeam.chooseTarget` — manually re-pick the target terminal
//       or pin clipboard-only mode for this session.
// - Settings (see package.json -> contributes.configuration):
//     - `codebeam.defaultTarget`: "auto" | "clipboard" | "terminal"
//     - `codebeam.rememberTerminalChoice`: boolean
//
// VS Code API concepts used here (for learning):
// - `vscode.window.activeTextEditor` — the currently focused editor, if any.
// - `editor.selection` — the highlighted range; `document.getText(range)`.
// - `vscode.workspace.asRelativePath(uri)` — workspace-relative path.
// - `vscode.env.clipboard.writeText()` — writes to the OS clipboard.
// - `vscode.window.setStatusBarMessage(text, timeoutMs)` — transient message.
// - `vscode.window.activeTerminal` — the currently focused terminal, if any.
// - `vscode.window.terminals` — ALL open terminals (active or not).
// - `terminal.sendText(text, addNewLine)` — types text into the terminal.
//   The 2nd param controls whether VS Code presses Enter after typing:
//   `false` = just paste the text and let the user review + submit manually.
//   We ALWAYS pass `false` so we never auto-submit a prompt to the AI CLI.
// - `terminal.show()` — reveals the terminal panel + focuses that terminal.
// - `vscode.window.showQuickPick(items)` — fuzzy picker for choosing a terminal.
// - `vscode.workspace.getConfiguration("codebeam")` — reads our settings.
// - `context.workspaceState` — simple key/value storage scoped to this
//   workspace. Survives reloads for that folder. We use it to remember the
//   user's terminal pick so we don't prompt on every send. `.get()` reads,
//   `.update(key, value)` writes (returns a Thenable — await it).
// - `context.subscriptions` — disposables VS Code cleans up on deactivate.

import * as vscode from "vscode";

// ---------------------------------------------------------------------------
// WorkspaceState keys (session memory — cleared via chooseTarget "Auto").
// ---------------------------------------------------------------------------

// Name of the terminal the user picked (via quickpick or chooseTarget).
const KEY_REMEMBERED_TERMINAL = "codebeam.rememberedTerminalName";
// When true, sendSelection always uses the clipboard even if terminals exist.
// Set via `codebeam.chooseTarget` -> "Clipboard only".
const KEY_FORCE_CLIPBOARD = "codebeam.forceClipboard";

// Valid values for the `codebeam.defaultTarget` setting.
type DefaultTarget = "auto" | "clipboard" | "terminal";

// Called once by VS Code when the extension is activated.
export function activate(context: vscode.ExtensionContext): void {
  const sendDisposable: vscode.Disposable =
    vscode.commands.registerCommand(
      "codebeam.sendSelection",
      async (): Promise<void> => {
        await sendSelection(context);
      }
    );

  // Second command: manual target picker (palette only, no keybinding).
  const chooseDisposable: vscode.Disposable =
    vscode.commands.registerCommand(
      "codebeam.chooseTarget",
      async (): Promise<void> => {
        await chooseTarget(context);
      }
    );

  context.subscriptions.push(sendDisposable, chooseDisposable);
}

// ---------------------------------------------------------------------------
// Main command: format the selection, then route to terminal or clipboard.
// ---------------------------------------------------------------------------
async function sendSelection(
  context: vscode.ExtensionContext
): Promise<void> {
  // 1. Guard: no open editor at all (e.g. focus is in the sidebar).
  const editor: vscode.TextEditor | undefined =
    vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showWarningMessage("CodeBeam: No active editor.");
    return;
  }

  // 2. Guard: editor is open but nothing is highlighted.
  //    `selection.isEmpty` is true when it's just a blinking cursor.
  const selection: vscode.Selection = editor.selection;
  if (selection.isEmpty) {
    void vscode.window.showWarningMessage(
      "CodeBeam: Select some code first."
    );
    return;
  }

  // 3. Build the markdown payload + metadata for status messages.
  const { payload, relativePath, startLine, endLine } =
    buildPayload(editor);

  // 4. Read user settings.
  const config: vscode.WorkspaceConfiguration =
    vscode.workspace.getConfiguration("codebeam");
  const defaultTarget: DefaultTarget = config.get<DefaultTarget>(
    "defaultTarget",
    "auto"
  );
  // `chooseTarget` -> "Clipboard only" pins clipboard for this session and
  // overrides the `defaultTarget` setting until reset back to Auto.
  const forceClipboard: boolean =
    context.workspaceState.get<boolean>(KEY_FORCE_CLIPBOARD, false);

  // 5. Pinned or configured clipboard-only: never touch terminals.
  if (forceClipboard || defaultTarget === "clipboard") {
    await copyToClipboard(
      payload,
      `$(clippy) CodeBeam: copied ${relativePath} (lines ${startLine}-${endLine}) — clipboard-only mode`
    );
    return;
  }

  // 6. Terminal modes ("auto" or "terminal"): resolve a target terminal.
  const openTerminals: readonly vscode.Terminal[] =
    vscode.window.terminals;

  // No terminals at all.
  if (openTerminals.length === 0) {
    if (defaultTarget === "terminal") {
      // Strict mode: the user demanded a terminal, so error out instead
      // of silently falling back.
      void vscode.window.showErrorMessage(
        "CodeBeam: No terminal open. Open a terminal running your AI CLI tool, then try again."
      );
      return;
    }
    // "auto" falls back to the clipboard.
    await copyToClipboard(
      payload,
      "$(clippy) CodeBeam: copied — no terminal open"
    );
    return;
  }

  const target: vscode.Terminal | undefined =
    await resolveTargetTerminal(context);

  // User dismissed the quickpick (pressed Esc) — do nothing.
  if (!target) {
    return;
  }

  // 7. Try to send; on failure fall back to clipboard so nothing is lost.
  try {
    // `false` = do NOT press Enter. The user reviews the pasted block in
    // the AI CLI prompt and submits it themselves.
    target.sendText(payload, false);
    // Bring the terminal panel forward so the user sees what landed.
    target.show();
    vscode.window.setStatusBarMessage(
      `$(terminal) CodeBeam: sent ${relativePath} (lines ${startLine}-${endLine}) to "${target.name}" — review & press Enter`,
      3000
    );
  } catch (err) {
    // sendText is normally sync + void, but a closed terminal or a remote
    // failure can throw — clipboard keeps the snippet recoverable.
    await copyToClipboard(
      payload,
      "$(clippy) CodeBeam: terminal send failed — copied to clipboard instead"
    );
  }
}

// ---------------------------------------------------------------------------
// Terminal resolution: remembered pick -> single terminal -> quickpick.
// Returns `undefined` when the user cancels the picker.
// ---------------------------------------------------------------------------
async function resolveTargetTerminal(
  context: vscode.ExtensionContext
): Promise<vscode.Terminal | undefined> {
  const openTerminals: readonly vscode.Terminal[] =
    vscode.window.terminals;

  // Defensive: caller already handles the zero case, but stay total.
  if (openTerminals.length === 0) {
    return undefined;
  }

  const config: vscode.WorkspaceConfiguration =
    vscode.workspace.getConfiguration("codebeam");
  const remember: boolean = config.get<boolean>(
    "rememberTerminalChoice",
    true
  );

  // 1. Reuse the remembered terminal if it still exists. Terminals are
  //    matched by NAME (the API exposes no stable id). If the user closed
  //    it, the name won't match — drop the stale entry and continue.
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
    // Stale entry — clear it so next send re-prompts.
    await context.workspaceState.update(KEY_REMEMBERED_TERMINAL, undefined);
  }

  // 2. Exactly one terminal: no ambiguity, use it directly.
  //    Prefer `activeTerminal` when set, else the lone entry.
  if (openTerminals.length === 1) {
    const only: vscode.Terminal =
      vscode.window.activeTerminal ?? openTerminals[0]!;
    if (remember) {
      // Remember single-terminal choice too, so opening a second terminal
      // later doesn't surprise — chooseTarget can always reset this.
      await context.workspaceState.update(
        KEY_REMEMBERED_TERMINAL,
        only.name
      );
    }
    return only;
  }

  // 3. Multiple terminals: ask the user which one runs their AI CLI.
  //    We list terminal NAMES (the human-readable labels in the dropdown).
  const pickedName: string | undefined =
    await vscode.window.showQuickPick(
      openTerminals.map((t: vscode.Terminal): string => t.name),
      {
        placeHolder:
          "CodeBeam: pick the terminal running your AI tool (Claude Code, Copilot CLI, Codex, OpenCode, aider, …)",
      }
    );

  if (!pickedName) {
    return undefined; // user pressed Esc
  }

  const picked: vscode.Terminal | undefined = openTerminals.find(
    (t: vscode.Terminal): boolean => t.name === pickedName
  );

  // 4. Remember the pick for the rest of the session (workspace-scoped)
  //    so the user isn't prompted on every send. Disable via the
  //    `codebeam.rememberTerminalChoice` setting.
  if (picked && remember) {
    await context.workspaceState.update(
      KEY_REMEMBERED_TERMINAL,
      picked.name
    );
  }

  return picked;
}

// ---------------------------------------------------------------------------
// Second command: manually re-pick the target or pin clipboard-only.
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
      description: "Clear saved choice",
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
    return; // Esc — leave everything unchanged.
  }

  if (picked.targetKind === "auto") {
    await context.workspaceState.update(
      KEY_REMEMBERED_TERMINAL,
      undefined
    );
    await context.workspaceState.update(KEY_FORCE_CLIPBOARD, false);
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

// Build the markdown code block:
//   ```typescript
//   // src/extension.ts (lines 12-24)
//   <selected text>
//   ```
// Line numbers are 1-based for humans (VS Code is 0-based internally).
function buildPayload(editor: vscode.TextEditor): Payload {
  const selection: vscode.Selection = editor.selection;
  const selectedText: string = editor.document.getText(selection);
  const relativePath: string = vscode.workspace.asRelativePath(
    editor.document.uri
  );
  const startLine: number = selection.start.line + 1;
  const endLine: number = selection.end.line + 1;
  // Language id becomes the markdown fence tag for syntax highlighting.
  const fenceLang: string = editor.document.languageId ?? "";

  const payload: string =
    `\`\`\`${fenceLang}\n` +
    `// ${relativePath} (lines ${startLine}-${endLine})\n` +
    `${selectedText}\n` +
    `\`\`\``;

  return { payload, relativePath, startLine, endLine };
}

// Copy to clipboard + show a caller-supplied status-bar message.
async function copyToClipboard(
  payload: string,
  statusMessage: string
): Promise<void> {
  await vscode.env.clipboard.writeText(payload);
  vscode.window.setStatusBarMessage(statusMessage, 3000);
}

// Called when the extension is deactivated (e.g. VS Code shuts down).
// Nothing to clean up beyond `context.subscriptions` (auto-disposed).
export function deactivate(): void {}
