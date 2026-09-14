// SelectBeam Bridge — content script (one file, all 4 providers).
// Runs on chatgpt.com, claude.ai, gemini.google.com, chat.deepseek.com.
// Two jobs, both localhost-only:
//
//   browser -> vscode: heartbeat POST /tabs { token, provider, url, title }
//     so VS Code remembers WHICH tab to reuse (temporary memory, TTL 60m).
//   vscode -> browser: poll GET /pending?token=&provider= every 2s, inject
//     queued code into the SAME tab's chat box, then POST /ack { token, id }.
//
// Never auto-submits. It only fills the chat box; you press Enter yourself.

(function () {
  "use strict";

  var HEARTBEAT_MS = 15000;
  var POLL_MS = 2000;

  function getApi() {
    if (typeof browser !== "undefined" && browser.storage) {
      return browser;
    }
    return chrome;
  }

  function detectProvider() {
    var h = location.hostname;
    if (h.indexOf("chatgpt.com") !== -1) {
      return "chatgpt";
    }
    if (h.indexOf("claude.ai") !== -1) {
      return "claude";
    }
    if (h.indexOf("gemini.google.com") !== -1) {
      return "gemini";
    }
    if (h.indexOf("deepseek.com") !== -1) {
      return "deepseek";
    }
    return null;
  }

  var PROVIDER = detectProvider();
  if (!PROVIDER) {
    return;
  }

  // Per-site chat-box selectors, most-specific first. Last entry is a
  // generic fallback (largest visible editable). Site redesigns break
  // selectors first — if autofill stops, update this table only.
  var SELECTORS = {
    chatgpt: ["#prompt-textarea", "[data-testid='prompt-textarea']", "div[contenteditable='true']", "textarea"],
    claude: ["[data-testid='chat-input']", "div[contenteditable='true']", "textarea"],
    gemini: ["rich-textarea", "div[contenteditable='true']", "textarea"],
    deepseek: ["#chat-input", "textarea", "div[contenteditable='true']"]
  };

  function isVisible(el) {
    if (!el || !el.getBoundingClientRect) {
      return false;
    }
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
  }

  function findChatBox() {
    var list = SELECTORS[PROVIDER] || ["textarea", "div[contenteditable='true']"];
    for (var i = 0; i < list.length; i++) {
      var els = document.querySelectorAll(list[i]);
      for (var j = 0; j < els.length; j++) {
        if (isVisible(els[j])) {
          return els[j];
        }
      }
    }
    return null;
  }

  // React-safe insert: execCommand('insertText') first (fires the right
  // events for ChatGPT/Claude/Gemini editors), native setter fallback.
  function injectText(el, text) {
    el.focus();
    var ok = false;
    try {
      ok = document.execCommand("insertText", false, text);
    } catch {
      ok = false;
    }
    if (!ok) {
      var tag = (el.tagName || "").toLowerCase();
      if (tag === "textarea" || tag === "input") {
        var proto = tag === "textarea" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        var setter = Object.getOwnPropertyDescriptor(proto, "value").set;
        setter.call(el, (el.value || "") + text);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        // contenteditable
        el.textContent = (el.textContent || "") + text;
        el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text }));
      }
    }
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function toast(msg) {
    try {
      var id = "selectbeam-toast";
      var old = document.getElementById(id);
      if (old) {
        old.remove();
      }
      var d = document.createElement("div");
      d.id = id;
      d.textContent = msg;
      d.style.cssText =
        "position:fixed;bottom:24px;right:24px;z-index:2147483647;" +
        "background:#111;color:#fff;padding:10px 14px;border-radius:8px;" +
        "font:13px system-ui;box-shadow:0 4px 16px rgba(0,0,0,.35);opacity:.95;";
      document.body.appendChild(d);
      setTimeout(function () {
        if (d.parentNode) {
          d.parentNode.removeChild(d);
        }
      }, 4000);
    } catch {
      // page CSP blocked inline styles — non-fatal
    }
  }

  function showBadge() {
    try {
      if (document.getElementById("selectbeam-badge")) {
        return;
      }
      var b = document.createElement("div");
      b.id = "selectbeam-badge";
      b.textContent = "SelectBeam linked ✓";
      b.title = "This tab is linked to VS Code. New sends reuse it.";
      b.style.cssText =
        "position:fixed;top:12px;right:12px;z-index:2147483647;" +
        "background:#0a7b34;color:#fff;padding:4px 10px;border-radius:999px;" +
        "font:12px system-ui;opacity:.9;";
      document.body.appendChild(b);
    } catch {
      // ignore
    }
  }

  async function loadCfg() {
    var api = getApi();
    try {
      var got = await api.storage.local.get({ token: "", port: 51337 });
      return { token: String(got.token || ""), port: Number(got.port) || 51337 };
    } catch {
      return { token: "", port: 51337 };
    }
  }

  function baseUrl(port) {
    return "http://127.0.0.1:" + port;
  }

  async function heartbeat(cfg) {
    if (!cfg.token) {
      return false;
    }
    try {
      var r = await fetch(baseUrl(cfg.port) + "/tabs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: cfg.token,
          provider: PROVIDER,
          url: location.href.slice(0, 500),
          title: document.title.slice(0, 200)
        })
      });
      return r.ok;
    } catch {
      return false; // VS Code closed / bridge off — retry next beat
    }
  }

  async function poll(cfg) {
    if (!cfg.token) {
      return;
    }
    try {
      var r = await fetch(
        baseUrl(cfg.port) + "/pending?token=" + encodeURIComponent(cfg.token) +
        "&provider=" + encodeURIComponent(PROVIDER)
      );
      if (!r.ok) {
        return;
      }
      var data = await r.json();
      var items = (data && data.items) || [];
      for (var i = 0; i < items.length; i++) {
        var box = findChatBox();
        if (!box) {
          break; // chat UI not ready — keep queued, retry next poll
        }
        injectText(box, (i > 0 ? "\n\n" : "") + items[i].text);
        try {
          await fetch(baseUrl(cfg.port) + "/ack", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: cfg.token, id: items[i].id })
          });
        } catch {
          // ack failed — item stays queued, may refill once. Acceptable.
        }
        toast("SelectBeam filled code (" + (items[i].fileRef || PROVIDER) + ") — review & submit yourself.");
      }
    } catch {
      // bridge down — silent, heartbeat will relink later
    }
  }

  async function tick() {
    var cfg = await loadCfg();
    if (!cfg.token) {
      return; // not linked yet — user must paste token in popup first
    }
    var linked = await heartbeat(cfg);
    if (linked) {
      showBadge();
      await poll(cfg);
    }
  }

  // Immediate link attempt, then steady beat. Intervals are cheap and
  // survive SPA navigation (ChatGPT changes URL without reload — we also
  // re-heartbeat on title change via MutationObserver below).
  tick();
  setInterval(tick, Math.max(POLL_MS, 1500));
  setInterval(function () {
    loadCfg().then(heartbeat);
  }, HEARTBEAT_MS);

  var lastTitle = document.title;
  try {
    new MutationObserver(function () {
      if (document.title !== lastTitle) {
        lastTitle = document.title;
        loadCfg().then(heartbeat);
      }
    }).observe(document.querySelector("title") || document.documentElement, {
      childList: true,
      subtree: true
    });
  } catch {
    // observer unsupported — heartbeat interval still covers it
  }
})();
