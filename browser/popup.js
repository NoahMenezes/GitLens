// SelectBeam Bridge — popup logic (Firefox + Chrome compatible, no deps).

(function () {
  "use strict";

  function getApi() {
    if (typeof browser !== "undefined" && browser.storage) {
      return browser;
    }
    return chrome;
  }
  var api = getApi();

  var portEl = document.getElementById("port");
  var tokenEl = document.getElementById("token");
  var statusEl = document.getElementById("status");

  function setStatus(msg, cls) {
    statusEl.textContent = msg;
    statusEl.className = cls || "";
  }

  function detectProvider(hostname) {
    if (hostname.indexOf("chatgpt.com") !== -1) {
      return "chatgpt";
    }
    if (hostname.indexOf("claude.ai") !== -1) {
      return "claude";
    }
    if (hostname.indexOf("gemini.google.com") !== -1) {
      return "gemini";
    }
    if (hostname.indexOf("deepseek.com") !== -1) {
      return "deepseek";
    }
    return null;
  }

  async function load() {
    try {
      var got = await api.storage.local.get({ token: "", port: 51337 });
      tokenEl.value = got.token || "";
      portEl.value = got.port || 51337;
    } catch {
      setStatus("Storage unavailable (private window?). Settings won't persist.", "bad");
    }
  }

  async function save(silent) {
    var port = parseInt(portEl.value, 10) || 51337;
    var token = tokenEl.value.trim();
    try {
      await api.storage.local.set({ token: token, port: port });
    } catch {
      // ignore — content script reads per-try anyway
    }
    if (!silent) {
      setStatus("Saved. Now press Link this tab.", "");
    }
    return { token: token, port: port };
  }

  async function activeTab() {
    try {
      var tabs = await api.tabs.query({ active: true, currentWindow: true });
      return tabs && tabs[0];
    } catch {
      return null;
    }
  }

  async function testBridge() {
    var cfg = await save(true);
    try {
      var r = await fetch("http://127.0.0.1:" + cfg.port + "/status");
      if (!r.ok) {
        throw new Error("HTTP " + r.status);
      }
      var data = await r.json();
      var n = data.liveTabs ? Object.keys(data.liveTabs).length : 0;
      setStatus("Bridge OK (v" + (data.version || "?") + "). Linked tabs: " + n + ", queued: " + (data.pending || 0) + ".", "ok");
    } catch {
      setStatus("Bridge unreachable at 127.0.0.1:" + cfg.port + ". Is VS Code open with SelectBeam running?", "bad");
    }
  }

  async function linkTab() {
    var cfg = await save(true);
    if (!cfg.token) {
      setStatus("Paste the token from VS Code first (Show Browser Bridge Status copies it).", "bad");
      return;
    }
    var tab = await activeTab();
    if (!tab || !tab.url) {
      setStatus("Could not read this tab. Open a chat tab and try again.", "bad");
      return;
    }
    var host = "";
    try {
      host = new URL(tab.url).hostname;
    } catch {
      host = "";
    }
    var provider = detectProvider(host);
    if (!provider) {
      setStatus("This tab is not a supported chat (open ChatGPT / Claude / Gemini / DeepSeek first).", "bad");
      return;
    }
    try {
      var r = await fetch("http://127.0.0.1:" + cfg.port + "/tabs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: cfg.token, provider: provider, url: tab.url.slice(0, 500), title: (tab.title || "").slice(0, 200) })
      });
      if (r.status === 401) {
        setStatus("Bad token. Copy it fresh from VS Code (Show Browser Bridge Status).", "bad");
        return;
      }
      if (!r.ok) {
        throw new Error("HTTP " + r.status);
      }
      setStatus("Linked! This " + provider + " tab will be reused for the next " + provider + " sends. Keep VS Code open.", "ok");
    } catch {
      setStatus("Bridge unreachable. Is VS Code open with SelectBeam running on port " + cfg.port + "?", "bad");
    }
  }

  document.getElementById("save").addEventListener("click", function () {
    save(false);
  });
  document.getElementById("test").addEventListener("click", testBridge);
  document.getElementById("link").addEventListener("click", linkTab);

  load();
})();
