// SelectBeam — localhost HTTP bridge (Node http only, zero dependencies).
// Lets the browser companion report its live tab and pick up queued code,
// so repeat sends reuse the SAME tab instead of opening new tabs.
//
// Zero-setup auth: the ONLY callers are the companion's background page
// (Origin: moz-extension://… / chrome-extension://…) and local tools
// (no Origin, e.g. the second VS Code window's /queue forward). Any
// http(s) page origin is rejected — websites can never touch the bridge,
// so there is no token to copy, ever.
//
// Endpoints (all localhost, CORS-open for the companion):
// - GET  /status              -> { ok, version, liveTabs, pending }
// - POST /tabs   {provider,url,title} -> remembers live tab (heartbeat)
// - GET  /pending?provider=   -> queued pastes for that provider
// - POST /ack    {id}         -> companion confirms pickup, we drop it
// - POST /filled {provider,fileRef} -> companion confirms the chat box was
//   filled: we refresh the tab memory and message YOU back in VS Code.
// - POST /bye    {provider}   -> tab closed/navigated away: forget it now
//   so the next send opens a FRESH chat instead of a dead tab.
// - GET  /tabs                -> live-tab map (popup status)
// - POST /queue  {provider,text,fileRef} -> forward a paste (multi-window)

import * as vscode from "vscode";
import * as http from "http";
import * as crypto from "crypto";
import {
  BRIDGE_VERSION,
  EXT_ORIGIN_PREFIXES,
  MAX_BODY_BYTES,
  MAX_PASTE_CHARS,
  MAX_PENDING,
  isKnownProvider,
} from "./constants";
import {
  getBridgePortSetting,
  isBridgeEnabledSetting,
} from "./config";
import { pasteHint, shortcutHint } from "./platform";
import {
  ageLabel,
  getLiveTabs,
  removeLiveTab,
  setLiveTab,
  touchLiveTab,
} from "./state";
import type { PendingPaste } from "./types";

const pendingQueue: PendingPaste[] = [];
let bridgeServer: http.Server | undefined;
let bridgeListening = false;

export function isBridgeOwner(): boolean {
  return bridgeListening && bridgeServer !== undefined;
}

export function getPendingCount(): number {
  return pendingQueue.length;
}

export function clearPendingQueue(): void {
  pendingQueue.length = 0;
}

export function queuePasteForBrowser(
  provider: string,
  text: string,
  fileRef: string
): PendingPaste {
  const item: PendingPaste = {
    id: `${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`,
    provider,
    text,
    fileRef,
    createdAt: Date.now(),
  };
  pendingQueue.push(item);
  while (pendingQueue.length > MAX_PENDING) {
    pendingQueue.shift();
  }
  return item;
}

/**
 * True when the caller may use the bridge: the companion background page
 * (extension origin) or a local non-browser client (no Origin at all,
 * e.g. curl or the second VS Code window). Web pages always send an
 * http(s) Origin and are rejected — this is what replaces the token.
 */
export function isAllowedOrigin(req: http.IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) {
    return true;
  }
  return EXT_ORIGIN_PREFIXES.some((p): boolean => origin.startsWith(p));
}

function sendJson(
  res: http.ServerResponse,
  status: number,
  body: unknown
): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Length": Buffer.byteLength(text),
  });
  res.end(text);
}

function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject): void => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer): void => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", (): void => {
      try {
        if (chunks.length === 0) {
          resolve({});
          return;
        }
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

export async function startBridgeServer(
  context: vscode.ExtensionContext
): Promise<void> {
  if (bridgeServer || !isBridgeEnabledSetting()) {
    return;
  }
  const port = getBridgePortSetting();

  const server = http.createServer((req, res): void => {
    void (async (): Promise<void> => {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        });
        res.end();
        return;
      }
      // GET /status — open health check (no live data beyond counts).
      if (req.method === "GET" && url.pathname === "/status") {
        sendJson(res, 200, {
          ok: true,
          version: BRIDGE_VERSION,
          ownsPort: true,
          liveCount: Object.keys(getLiveTabs(context)).length,
          pending: pendingQueue.length,
        });
        return;
      }
      // Everything else: companion or local clients only.
      if (!isAllowedOrigin(req)) {
        sendJson(res, 401, { ok: false, error: "forbidden origin" });
        return;
      }
      // GET /tabs — popup status.
      if (req.method === "GET" && url.pathname === "/tabs") {
        sendJson(res, 200, { ok: true, liveTabs: getLiveTabs(context) });
        return;
      }
      // GET /pending?provider= — companion polls this.
      if (req.method === "GET" && url.pathname === "/pending") {
        const provider = url.searchParams.get("provider") || "";
        const items = pendingQueue.filter(
          (p): boolean => p.provider === provider
        );
        sendJson(res, 200, { ok: true, items });
        return;
      }
      // POST /tabs { provider, url, title } — heartbeat (b->v).
      if (req.method === "POST" && url.pathname === "/tabs") {
        const body = (await readJsonBody(req)) as {
          provider?: string; url?: string; title?: string;
        };
        if (!body.provider || !isKnownProvider(body.provider)) {
          sendJson(res, 400, { ok: false, error: "unknown provider" });
          return;
        }
        await setLiveTab(
          context,
          body.provider,
          typeof body.url === "string" ? body.url.slice(0, 500) : "",
          typeof body.title === "string" ? body.title.slice(0, 200) : ""
        );
        sendJson(res, 200, { ok: true });
        return;
      }
      // POST /ack { id } — companion picked up a paste.
      if (req.method === "POST" && url.pathname === "/ack") {
        const body = (await readJsonBody(req)) as { id?: string };
        const i = pendingQueue.findIndex((p): boolean => p.id === body.id);
        if (i >= 0) {
          pendingQueue.splice(i, 1);
        }
        sendJson(res, 200, { ok: true });
        return;
      }
      // POST /filled { provider, fileRef } — the chat box was actually
      // filled. Refresh the tab memory (this tab is definitely the one)
      // and message back into VS Code so you know it landed.
      if (req.method === "POST" && url.pathname === "/filled") {
        const body = (await readJsonBody(req)) as {
          provider?: string; fileRef?: string;
        };
        if (!body.provider || !isKnownProvider(body.provider)) {
          sendJson(res, 400, { ok: false, error: "unknown provider" });
          return;
        }
        await touchLiveTab(context, body.provider);
        const ref =
          typeof body.fileRef === "string" && body.fileRef.length > 0
            ? ` (${body.fileRef})`
            : "";
        void vscode.window.showInformationMessage(
          `SelectBeam: pasted into your ${body.provider} tab${ref} — review & submit there.`
        );
        vscode.window.setStatusBarMessage(
          `$(check) SelectBeam: ${body.provider} tab filled${ref}`,
          5000
        );
        sendJson(res, 200, { ok: true });
        return;
      }
      // POST /bye { provider } — tab closed or navigated away from the
      // chat. Forget it immediately so the next send opens a fresh chat.
      if (req.method === "POST" && url.pathname === "/bye") {
        const body = (await readJsonBody(req)) as { provider?: string };
        if (!body.provider || !isKnownProvider(body.provider)) {
          sendJson(res, 400, { ok: false, error: "unknown provider" });
          return;
        }
        await removeLiveTab(context, body.provider);
        sendJson(res, 200, { ok: true });
        return;
      }
      // POST /queue { provider, text, fileRef } — multi-window
      // forward: a window that does NOT own the port can still queue.
      if (req.method === "POST" && url.pathname === "/queue") {
        const body = (await readJsonBody(req)) as {
          provider?: string; text?: string; fileRef?: string;
        };
        if (
          !body.provider ||
          !isKnownProvider(body.provider) ||
          typeof body.text !== "string"
        ) {
          sendJson(res, 400, { ok: false, error: "bad request" });
          return;
        }
        const item = queuePasteForBrowser(
          body.provider,
          body.text.slice(0, MAX_PASTE_CHARS),
          typeof body.fileRef === "string" ? body.fileRef : ""
        );
        sendJson(res, 200, { ok: true, id: item.id });
        return;
      }
      sendJson(res, 404, { ok: false, error: "not found" });
    })().catch((): void => {
      try {
        sendJson(res, 500, { ok: false, error: "bridge error" });
      } catch {
        // socket already gone — nothing to do
      }
    });
  });

  // Never call close() on a server that failed to bind. Node throws
  // ERR_SERVER_NOT_RUNNING for close() without listen(). Track `bound`
  // and only keep the server when it actually owns the port.
  const bound: boolean = await new Promise<boolean>((resolve): void => {
    server.on("error", (err: NodeJS.ErrnoException): void => {
      if (err.code === "EADDRINUSE") {
        // Another VS Code window owns the bridge — copy+open fallback.
        void vscode.window.showWarningMessage(
          `SelectBeam: bridge port ${port} is taken (another window owns it). This window uses copy+open fallback.`
        );
      } else {
        void vscode.window.showWarningMessage(
          `SelectBeam: bridge could not start (${err.message}). Using copy+open fallback.`
        );
      }
      resolve(false);
    });
    server.listen(port, "127.0.0.1", (): void => resolve(true));
  });
  if (bound) {
    bridgeServer = server;
    bridgeListening = true;
  }
  // Unbound server is left alone: it never listened, so there is nothing
  // to close and no handle to leak.
}

export function stopBridgeServer(): void {
  // Guard close() — only a listening server may be closed.
  if (bridgeServer && bridgeListening) {
    try {
      bridgeServer.close();
    } catch {
      // already closed — ignore
    }
  }
  bridgeServer = undefined;
  bridgeListening = false;
}

export async function showBridgeStatus(
  context: vscode.ExtensionContext
): Promise<void> {
  const port = getBridgePortSetting();
  const tabs = Object.values(getLiveTabs(context));
  const liveLine =
    tabs.length === 0
      ? "No linked tabs yet — open any supported AI chat and send from VS Code."
      : tabs
          .map(
            (t): string =>
              `${t.provider}: "${t.title || t.url}" (${ageLabel(t.updatedAt)})`
          )
          .join("\n");
  const msg =
    `SelectBeam bridge ${isBridgeOwner() ? "RUNNING" : "NOT OWNING PORT"} — http://127.0.0.1:${port}\n\n` +
    `Live tabs:\n${liveLine}\n\nQueued: ${pendingQueue.length} (shortcut ${shortcutHint()}, paste ${pasteHint()})`;
  void vscode.window.showInformationMessage(msg, { modal: true });
}
