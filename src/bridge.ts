// SelectBeam — localhost HTTP bridge (Node http only, zero dependencies).
// Lets the browser companion report its live tab and pick up queued code,
// so repeat sends reuse the SAME tab instead of opening new tabs.
//
// Endpoints (all localhost, token-guarded except /status, CORS-open):
// - GET  /status                  -> { ok, version, liveTabs, pending }
// - POST /tabs   {token,provider,url,title} -> remembers live tab (heartbeat)
// - GET  /pending?token=&provider= -> queued pastes for that provider
// - POST /ack    {token,id}       -> companion confirms pickup, we drop it
// - GET  /tabs?token=             -> live-tab map (popup status)
// - POST /queue  {token,provider,text} -> forward a paste (multi-window)

import * as vscode from "vscode";
import * as http from "http";
import * as crypto from "crypto";
import {
  BRIDGE_VERSION,
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
  getOrCreateBridgeToken,
  setLiveTab,
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
  const token = await getOrCreateBridgeToken(context);
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
      // GET /status — no token needed (health check for popup).
      if (req.method === "GET" && url.pathname === "/status") {
        sendJson(res, 200, {
          ok: true,
          version: BRIDGE_VERSION,
          ownsPort: true,
          liveTabs: getLiveTabs(context),
          pending: pendingQueue.length,
        });
        return;
      }
      // GET /tabs?token= — popup status.
      if (req.method === "GET" && url.pathname === "/tabs") {
        if (url.searchParams.get("token") !== token) {
          sendJson(res, 401, { ok: false, error: "bad token" });
          return;
        }
        sendJson(res, 200, { ok: true, liveTabs: getLiveTabs(context) });
        return;
      }
      // GET /pending?token=&provider= — companion polls this.
      if (req.method === "GET" && url.pathname === "/pending") {
        if (url.searchParams.get("token") !== token) {
          sendJson(res, 401, { ok: false, error: "bad token" });
          return;
        }
        const provider = url.searchParams.get("provider") || "";
        const items = pendingQueue.filter(
          (p): boolean => p.provider === provider
        );
        sendJson(res, 200, { ok: true, items });
        return;
      }
      // POST /tabs { token, provider, url, title } — heartbeat (b->v).
      if (req.method === "POST" && url.pathname === "/tabs") {
        const body = (await readJsonBody(req)) as {
          token?: string; provider?: string; url?: string; title?: string;
        };
        if (body.token !== token) {
          sendJson(res, 401, { ok: false, error: "bad token" });
          return;
        }
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
      // POST /ack { token, id } — companion picked up a paste.
      if (req.method === "POST" && url.pathname === "/ack") {
        const body = (await readJsonBody(req)) as {
          token?: string; id?: string;
        };
        if (body.token !== token) {
          sendJson(res, 401, { ok: false, error: "bad token" });
          return;
        }
        const i = pendingQueue.findIndex((p): boolean => p.id === body.id);
        if (i >= 0) {
          pendingQueue.splice(i, 1);
        }
        sendJson(res, 200, { ok: true });
        return;
      }
      // POST /queue { token, provider, text, fileRef } — multi-window
      // forward: a window that does NOT own the port can still queue.
      if (req.method === "POST" && url.pathname === "/queue") {
        const body = (await readJsonBody(req)) as {
          token?: string; provider?: string; text?: string; fileRef?: string;
        };
        if (body.token !== token) {
          sendJson(res, 401, { ok: false, error: "bad token" });
          return;
        }
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

  // FIX: never call close() on a server that failed to bind. Node throws
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
  // FIX: guard close() — only a listening server may be closed.
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
  const token = await getOrCreateBridgeToken(context);
  const port = getBridgePortSetting();
  const tabs = Object.values(getLiveTabs(context));
  const liveLine =
    tabs.length === 0
      ? "No linked tabs yet. Open a chat once, then press Link in the companion popup."
      : tabs
          .map(
            (t): string =>
              `${t.provider}: "${t.title || t.url}" (${ageLabel(t.updatedAt)})`
          )
          .join("\n");
  // FIX: status is information, not a warning — modal info, not modal warn.
  const msg =
    `SelectBeam bridge ${isBridgeOwner() ? "RUNNING" : "NOT OWNING PORT"} — http://127.0.0.1:${port}\n` +
    `Token (paste once into companion popup): ${token}\n\n` +
    `Endpoints: GET /status · POST /tabs · GET /pending?token=&provider= · POST /ack · GET /tabs?token= · POST /queue\n\n` +
    `Live tabs:\n${liveLine}\n\nQueued: ${pendingQueue.length} (shortcut ${shortcutHint()}, paste ${pasteHint()})`;
  await vscode.env.clipboard.writeText(token);
  void vscode.window.showInformationMessage(
    "SelectBeam: bridge token copied to clipboard — paste it into the companion popup."
  );
  void vscode.window.showInformationMessage(msg, { modal: true });
}
