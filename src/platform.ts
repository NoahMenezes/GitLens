export function isMac(): boolean {
  return process.platform === "darwin";
}

export function pasteHint(): string {
  return isMac() ? "Cmd+V" : "Ctrl+V";
}

export function shortcutHint(): string {
  return isMac() ? "Cmd+Alt+A" : "Ctrl+Alt+A";
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve: () => void): void => {
    setTimeout(resolve, ms);
  });
}
