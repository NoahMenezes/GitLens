// SelectBeam — extension entrypoint (thin wiring only).
// Behavior lives in modules so each file stays small and AI-friendly:
//
//   types.ts      shared types (no runtime code)
//   constants.ts  storage keys, limits, agent + browser catalogs
//   platform.ts   Mac hints, sleep
//   config.ts     all `selectbeam.*` settings reads
//   payload.ts    code-block building, clipboard, optional instruction
//   state.ts      workspace/global state (terminals, last pick, live tabs)
//   bridge.ts     localhost HTTP bridge + Show Bridge Status
//   terminal.ts   terminal send path (target, agent guard, launch)
//   browserSend.ts browser send path (resolve, tab reuse, open)
//   commands.ts   sendSelection orchestration + chooseTarget
//
// Send paths (all free, no API keys, no internet beyond localhost):
// - TERMINAL: format selection as markdown, ensure an AI CLI runs in the
//   target terminal BEFORE pasting (never blind-paste ``` into a shell).
// - BROWSER (no companion): copy + openExternal(); you paste once.
// - BROWSER (with companion): companion heartbeats its live tab to the
//   bridge and polls queued code, so the SAME tab is refilled. Missing or
//   dead chat -> open a new one. Never auto-submits.

import * as vscode from "vscode";
import { chooseTarget, sendSelection } from "./commands";
import { sendToBrowser } from "./browserSend";
import { showBridgeStatus, startBridgeServer, stopBridgeServer } from "./bridge";

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
    ),
    vscode.commands.registerCommand(
      "selectbeam.showBridgeStatus",
      async (): Promise<void> => showBridgeStatus(context)
    )
  );

  // Start the localhost bridge in the background. Never blocks activation;
  // if the port is taken (second window), we stay in copy+open mode.
  void startBridgeServer(context);
  context.subscriptions.push({ dispose: (): void => stopBridgeServer() });
}

export function deactivate(): void {
  stopBridgeServer();
}
