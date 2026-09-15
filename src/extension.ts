import * as vscode from "vscode";
import { chooseTarget, sendSelection } from "./commands";
import { sendToBrowser } from "./browserSend";
import { showBridgeStatus, startBridgeServer, stopBridgeServer } from "./bridge";

export function activate(context: vscode.ExtensionContext): void {
  const cmds: Array<[string, () => Promise<void>]> = [
    ["selectbeam.sendSelection", (): Promise<void> => sendSelection(context)],
    ["selectbeam.sendToBrowser", (): Promise<void> => sendToBrowser(context)],
    ["selectbeam.chooseTarget", (): Promise<void> => chooseTarget(context)],
    ["selectbeam.showBridgeStatus", (): Promise<void> => showBridgeStatus(context)],
  ];
  for (const [id, fn] of cmds) {
    context.subscriptions.push(vscode.commands.registerCommand(id, fn));
  }
  void startBridgeServer(context);
  context.subscriptions.push({ dispose: (): void => stopBridgeServer() });
}

export function deactivate(): void {
  stopBridgeServer();
}
