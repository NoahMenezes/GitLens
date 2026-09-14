// SelectBeam — platform + tiny async helpers. No vscode import.

export function isMac(): boolean {
  return process.platform === "darwin";
}

/** Paste key to show in messages: Cmd+V on Mac, Ctrl+V elsewhere. */
export function pasteHint(): string {
  return isMac() ? "Cmd+V" : "Ctrl+V";
}

/** Shortcut to show in messages: Cmd+Alt+A on Mac, Ctrl+Alt+A elsewhere. */
export function shortcutHint(): string {
  return isMac() ? "Cmd+Alt+A" : "Ctrl+Alt+A";
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve: () => void): void => {
    setTimeout(resolve, ms);
  });
}
