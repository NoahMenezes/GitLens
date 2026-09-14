// SelectBeam Bridge — background script (Firefox scripts + Chrome SW safe).
// Owns ALL bridge networking so the server can trust the extension Origin
// (moz-extension:// / chrome-extension://) instead of a token. Web pages
// can never send that Origin, so no setup is needed — zero token, zero
// pairing. Content scripts only inject text and report what they see.
//
// Why not fetch from the content script? Its requests carry the PAGE's
// Origin (https://chatgpt.com/…), which the server must reject. Requests
// from here carry the EXTENSION's Origin, which the server allows.
// Content scripts stay alive while a chat tab is open and wake this page
// with messages, so event-page suspension is harmless by construction.

const DEFAULT_PORT = 51337;

function getApi() {
  if (typeof browser !== "undefined" && browser.runtime) {
    return browser;
  }
  return chrome;
}

const api = getApi();

// tabId -> provider for tabs that heartbeated. Lets onRemoved tell VS Code
// exactly which chat closed.
const tabProviders = {};

async function getPort() {
  try {
    const got = await api.storage.local.get({ port: DEFAULT_PORT });
    return Number(got.port) || DEFAULT_PORT;
  } catch {
    return DEFAULT_PORT;
  }
}

function base(port) {
  return "http://127.0.0.1:" + port;
}

async function postJSON(port, path, body) {
  const r = await fetch(base(port) + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    throw new Error("HTTP " + r.status);
  }
  return r.json();
}

async function getJSON(port, path) {
  const r = await fetch(base(port) + path);
  if (!r.ok) {
    throw new Error("HTTP " + r.status);
  }
  return r.json();
}

// Content script says: "I am this chat tab" -> register heartbeat.
// sender.tab.id lets us notice when THAT tab closes (see onRemoved).
async function heartbeat(msg, sender) {
  const port = await getPort();
  await postJSON(port, "/tabs", {
    provider: msg.provider,
    url: String(msg.url || "").slice(0, 500),
    title: String(msg.title || "").slice(0, 200)
  });
  try {
    if (sender && sender.tab && typeof sender.tab.id === "number") {
      tabProviders[sender.tab.id] = msg.provider;
    }
  } catch {
    // tracking is best-effort only
  }
  return { linked: true };
}

// Content script says: "anything for me?" -> queued pastes for provider.
async function poll(msg) {
  const port = await getPort();
  const data = await getJSON(port, "/pending?provider=" + encodeURIComponent(msg.provider));
  return { items: (data && data.items) || [] };
}

// Content script says: "filled it" -> drop from queue + tell VS Code the
// paste landed (server pops the "pasted into your tab" message there).
async function ack(msg) {
  const port = await getPort();
  await postJSON(port, "/ack", { id: msg.id });
  return { ok: true };
}

// Content script says: "it is IN the chat box now" -> VS Code messages you.
async function filled(msg) {
  const port = await getPort();
  try {
    await postJSON(port, "/filled", {
      provider: msg.provider,
      fileRef: String(msg.fileRef || "").slice(0, 200)
    });
  } catch {
    // VS Code closed mid-fill — the code is still in the chat box.
  }
  return { ok: true };
}

// Tab closed or navigated away -> VS Code forgets it NOW so the next send
// opens a FRESH chat instead of reusing a dead entry.
async function bye(msg, sender, tabId) {
  const port = await getPort();
  var provider = msg && msg.provider;
  if (!provider && typeof tabId === "number") {
    provider = tabProviders[tabId];
    delete tabProviders[tabId];
  }
  if (!provider) {
    return { ok: false };
  }
  try {
    await postJSON(port, "/bye", { provider });
  } catch {
    // bridge down — staleness window covers it
  }
  return { ok: true };
}

// Popup says: "how are we?" -> bridge health + live tabs.
async function status() {
  const port = await getPort();
  const health = await getJSON(port, "/status");
  let liveTabs = {};
  try {
    const t = await getJSON(port, "/tabs");
    liveTabs = (t && t.liveTabs) || {};
  } catch {
    liveTabs = {};
  }
  return { port, health, liveTabs };
}

const handlers = { hb: heartbeat, poll, ack, filled, bye, status };

function onMessage(msg, sender, sendResponse) {
  const fn = msg && handlers[msg.type];
  if (!fn) {
    return false;
  }
  // Async reply: return true keeps the channel open (both browsers).
  fn(msg, sender).then(
    (out) => sendResponse({ ok: true, ...out }),
    (err) => sendResponse({ ok: false, error: String((err && err.message) || err) })
  );
  return true;
}

try {
  api.runtime.onMessage.addListener(onMessage);
} catch {
  // Unsupported environment — content scripts degrade to manual paste.
}

// A chat tab closed (or crashed): tell VS Code immediately so the next
// send opens a FRESH chat instead of reusing the dead tab.
try {
  if (api.tabs && api.tabs.onRemoved) {
    api.tabs.onRemoved.addListener((tabId) => {
      if (tabProviders[tabId]) {
        bye(null, null, tabId);
      }
    });
  }
} catch {
  // tabs events unavailable — heartbeat window covers it
}

try {
  if (api.runtime && api.runtime.onInstalled) {
    api.runtime.onInstalled.addListener(async () => {
      try {
        const cur = await api.storage.local.get({ port: DEFAULT_PORT });
        await api.storage.local.set({ port: Number(cur.port) || DEFAULT_PORT });
      } catch {
        // storage unavailable — defaults still work in memory.
      }
    });
  }
} catch {
  // ignore
}
