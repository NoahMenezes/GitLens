const DEFAULT_PORT = 51337;

function getApi() {
  if (typeof browser !== "undefined" && browser.runtime) {
    return browser;
  }
  return chrome;
}

const api = getApi();
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
  }
  return { linked: true };
}

async function poll(msg) {
  const port = await getPort();
  const data = await getJSON(port, "/pending?provider=" + encodeURIComponent(msg.provider));
  return { items: (data && data.items) || [] };
}

async function ack(msg) {
  const port = await getPort();
  await postJSON(port, "/ack", { id: msg.id });
  return { ok: true };
}

async function filled(msg) {
  const port = await getPort();
  try {
    await postJSON(port, "/filled", {
      provider: msg.provider,
      fileRef: String(msg.fileRef || "").slice(0, 200)
    });
  } catch {
  }
  return { ok: true };
}

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
  }
  return { ok: true };
}

async function focusTab(msg, sender) {
  try {
    const tabId = sender && sender.tab && sender.tab.id;
    const windowId = sender && sender.tab && sender.tab.windowId;
    if (typeof tabId === "number" && api.tabs && api.tabs.update) {
      const u = api.tabs.update(tabId, { active: true });
      if (u && typeof u.then === "function") {
        await u;
      }
    }
    if (typeof windowId === "number" && api.windows && api.windows.update) {
      const w = api.windows.update(windowId, { focused: true });
      if (w && typeof w.then === "function") {
        await w;
      }
    }
    return { ok: true, focused: true };
  } catch {
    return { ok: false };
  }
}

async function status() {
  const port = await getPort();
  const health = await getJSON(port, "/status");
  let liveTabs = {};
  try {
    const t = await getJSON(port, "/tabs");
    liveTabs = (t && t.liveTabs) || {};
  } catch {
  }
  return { port, health, liveTabs };
}

const handlers = { hb: heartbeat, poll, ack, filled, bye, status, focusTab };

function onMessage(msg, sender, sendResponse) {
  const fn = msg && handlers[msg.type];
  if (!fn) {
    return false;
  }
  fn(msg, sender).then(
    (out) => sendResponse({ ok: true, ...out }),
    (err) => sendResponse({ ok: false, error: String((err && err.message) || err) })
  );
  return true;
}

try {
  api.runtime.onMessage.addListener(onMessage);
} catch {
}

try {
  if (api.tabs && api.tabs.onRemoved) {
    api.tabs.onRemoved.addListener((tabId) => {
      if (tabProviders[tabId]) {
        bye(null, null, tabId);
      }
    });
  }
} catch {
}

try {
  if (api.runtime && api.runtime.onInstalled) {
    api.runtime.onInstalled.addListener(async () => {
      try {
        const cur = await api.storage.local.get({ port: DEFAULT_PORT });
        await api.storage.local.set({ port: Number(cur.port) || DEFAULT_PORT });
      } catch {
      }
    });
  }
} catch {
}
