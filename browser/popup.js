(function () {
  "use strict";

  function getApi() {
    if (typeof browser !== "undefined" && browser.runtime) {
      return browser;
    }
    return chrome;
  }
  var api = getApi();
  var portEl = document.getElementById("port");
  var statusEl = document.getElementById("status");

  function setStatus(msg, cls) {
    statusEl.textContent = msg;
    statusEl.className = cls || "";
  }

  function sendMsg(msg) {
    try {
      var p = api.runtime.sendMessage(msg);
      if (p && typeof p.then === "function") {
        return p;
      }
    } catch {
    }
    return new Promise(function (resolve) {
      try {
        api.runtime.sendMessage(msg, function (res) {
          resolve(res || { ok: false });
        });
      } catch {
        resolve({ ok: false });
      }
    });
  }

  async function loadPort() {
    try {
      var got = await api.storage.local.get({ port: 51337 });
      portEl.value = got.port || 51337;
    } catch {
    }
  }

  async function savePort() {
    var port = parseInt(portEl.value, 10) || 51337;
    try {
      await api.storage.local.set({ port: port });
    } catch {
    }
    setStatus("Port saved (" + port + "). Refreshing…", "");
    refresh();
  }

  async function refresh() {
    var res;
    try {
      res = await sendMsg({ type: "status" });
    } catch {
      res = null;
    }
    if (!res || !res.ok) {
      setStatus("Bridge unreachable. Is VS Code open with SelectBeam running?", "bad");
      return;
    }
    var tabs = res.liveTabs || {};
    var names = Object.keys(tabs);
    var lines = names.length === 0
      ? "No linked tabs yet — open a chat and send from VS Code."
      : names.map(function (k) {
          var t = tabs[k];
          return "- " + k + ': "' + (t.title || t.url || "?") + '"';
        }).join("\n");
    setStatus(
      "Bridge OK (v" + ((res.health && res.health.version) || "?") + ", port " + res.port + ").\n" +
      "Queued: " + ((res.health && res.health.pending) || 0) + ".\n" + lines,
      "ok"
    );
  }

  document.getElementById("save").addEventListener("click", savePort);
  document.getElementById("refresh").addEventListener("click", refresh);
  loadPort().then(refresh);
})();
