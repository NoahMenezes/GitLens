// SelectBeam Bridge — content script (one file, all 4 providers).
// Runs on chatgpt.com, claude.ai, gemini.google.com, chat.deepseek.com.
// Two jobs, both localhost-only:
//
//   browser -> vscode: heartbeat POST /tabs { token, provider, url, title }
//     so VS Code remembers WHICH tab to reuse (temporary memory, TTL 60m).
//   vscode -> browser: poll GET /pending?token=&provider= every 2s, PASTE
//     queued code into the SAME tab's chat box, then POST /ack { token, id }.
//
// Paste, never send: it only fills the chat box; you press Enter yourself.
// Every paste is VERIFIED (the text must actually appear in the box). If a
// strategy fails we try the next one; if all fail we retry on later polls
// and finally tell you to press Ctrl+V / Cmd+V manually (VS Code always
// copies to the clipboard first, so nothing is ever lost).

(function () {
  "use strict";

  var HEARTBEAT_MS = 15000;
  var POLL_MS = 2000;
  // How many polls (~2s each) we retry a failed paste before giving up and
  // asking for a manual paste. ~10 tries ~= 20 seconds.
  var MAX_ATTEMPTS = 10;

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

  // Per-site chat-box selectors, most-specific first. Site redesigns break
  // selectors first — if autofill stops working after a site update, this
  // table is the ONLY thing that needs updating.
  var SELECTORS = {
    chatgpt: [
      "#prompt-textarea",
      "[data-testid='prompt-textarea']",
      "div.ProseMirror",
      "form div[contenteditable='true']",
      "div[contenteditable='true']",
      "form textarea",
      "textarea"
    ],
    claude: [
      "[data-testid='chat-input']",
      "div[contenteditable='true']",
      "textarea"
    ],
    gemini: [
      "rich-textarea div[contenteditable='true']",
      "rich-textarea",
      "div[contenteditable='true']",
      "textarea"
    ],
    deepseek: [
      "#chat-input",
      "textarea",
      "div[contenteditable='true']"
    ]
  };

  // attempts[id] = number of failed paste tries for a queued item.
  var attempts = {};
  // Toasted flags so we only nag once per item / state.
  var toastedNoBox = {};
  var toastedManual = {};

  function isVisible(el) {
    if (!el || !el.getBoundingClientRect) {
      return false;
    }
    var r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) {
      return false;
    }
    try {
      return getComputedStyle(el).visibility !== "hidden";
    } catch {
      return true;
    }
  }

  // Rich-textarea style wrappers: drill into the real editable inside.
  function unwrap(el) {
    if (!el || !el.querySelector) {
      return el;
    }
    var tag = (el.tagName || "").toLowerCase();
    var editable = tag === "textarea" || tag === "input"
      ? null
      : el.querySelector("div[contenteditable='true'], [contenteditable='plaintext-only'], textarea");
    if (editable && editable !== el) {
      return editable;
    }
    return el;
  }

  function area(el) {
    try {
      var r = el.getBoundingClientRect();
      return Math.max(0, r.width) * Math.max(0, r.height);
    } catch {
      return 0;
    }
  }

  // Pick the largest visible editable — chat inputs are the biggest
  // contenteditable on these pages; tiny editables are usually comments.
  function findChatBox() {
    var list = SELECTORS[PROVIDER] || ["textarea", "div[contenteditable='true']"];
    var best = null;
    var bestArea = 0;
    for (var i = 0; i < list.length; i++) {
      var els;
      try {
        els = document.querySelectorAll(list[i]);
      } catch {
        continue;
      }
      for (var j = 0; j < els.length; j++) {
        var cand = unwrap(els[j]);
        if (!cand || !isVisible(cand)) {
          continue;
        }
        // Drilled into a real inner editor (e.g. inside rich-textarea) —
        // trust it immediately.
        if (cand !== els[j]) {
          return cand;
        }
        var a = area(cand);
        if (!best || a > bestArea) {
          best = cand;
          bestArea = a;
        }
      }
      if (best && i < 2) {
        return best; // specific selector hit — trust it
      }
    }
    return best;
  }

  function boxText(el) {
    if (!el) {
      return "";
    }
    var tag = (el.tagName || "").toLowerCase();
    if (tag === "textarea" || tag === "input") {
      return el.value || "";
    }
    return el.innerText || el.textContent || "";
  }

  function verified(el, text) {
    // Head-snippet check: first 40 non-space chars must be present.
    var head = text.replace(/\s+/g, " ").slice(0, 40);
    if (!head) {
      return true;
    }
    return boxText(el).replace(/\s+/g, " ").indexOf(head) !== -1;
  }

  function caretToEnd(el) {
    try {
      el.focus();
      var sel = window.getSelection();
      var range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch {
      try {
        el.focus();
      } catch {
        // ignore — strategies below still try
      }
    }
  }

  // Strategy 1 (best for ProseMirror/Lexical/Slate editors like ChatGPT):
  // caret to end + execCommand insertText, so the editor's own model updates.
  function tryExecInsert(el, text) {
    caretToEnd(el);
    var ok = false;
    try {
      ok = document.execCommand("insertText", false, text);
    } catch {
      ok = false;
    }
    return !!ok && verified(el, text);
  }

  // Strategy 2 (best for plain textarea/input): native value setter +
  // input/change events, so React/Vue controlled inputs notice.
  function tryNativeSetter(el, text) {
    var tag = (el.tagName || "").toLowerCase();
    if (tag !== "textarea" && tag !== "input") {
      return false;
    }
    try {
      el.focus();
      var proto = tag === "textarea" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      var setter = Object.getOwnPropertyDescriptor(proto, "value").set;
      setter.call(el, (el.value || "") + text);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return verified(el, text);
    } catch {
      return false;
    }
  }

  // Strategy 3 (last resort for contenteditable): append a text node +
  // synthetic input event.
  function tryAppendText(el, text) {
    var tag = (el.tagName || "").toLowerCase();
    if (tag === "textarea" || tag === "input") {
      return false;
    }
    try {
      el.focus();
      // If the editor only holds a placeholder paragraph, clear it first.
      var current = boxText(el).trim();
      if (!current || current.toLowerCase().indexOf("message") === 0) {
        el.innerHTML = "";
      }
      el.appendChild(document.createTextNode(text));
      el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text }));
      el.scrollTop = el.scrollHeight;
      return verified(el, text);
    } catch {
      return false;
    }
  }

  function pasteIntoBox(el, text) {
    return tryExecInsert(el, text) ||
      tryNativeSetter(el, text) ||
      tryAppendText(el, text);
  }

  function toast(msg, ms) {
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
        "position:fixed;bottom:24px;right:24px;z-index:2147483647;max-width:340px;" +
        "background:#111;color:#fff;padding:10px 14px;border-radius:8px;" +
        "font:13px system-ui;box-shadow:0 4px 16px rgba(0,0,0,.35);opacity:.95;";
      document.body.appendChild(d);
      setTimeout(function () {
        if (d.parentNode) {
          d.parentNode.removeChild(d);
        }
      }, ms || 5000);
    } catch {
      // page CSP blocked inline styles — non-fatal
    }
  }

  // Green = linked, amber = token missing. Click = fill now.
  function showBadge(linked) {
    try {
      var b = document.getElementById("selectbeam-badge");
      if (!b) {
        b = document.createElement("div");
        b.id = "selectbeam-badge";
        b.style.cssText =
          "position:fixed;top:12px;right:12px;z-index:2147483647;cursor:pointer;" +
          "color:#fff;padding:4px 10px;border-radius:999px;" +
          "font:12px system-ui;opacity:.9;";
        b.addEventListener("click", function () {
          loadCfg().then(function (cfg) {
            if (cfg.token) {
              poll(cfg);
            } else {
              toast("SelectBeam: not linked — open the popup, paste the token, Save, Link this tab.");
            }
          });
        });
        document.body.appendChild(b);
      }
      b.textContent = linked ? "SelectBeam linked ✓" : "SelectBeam: not linked";
      b.title = linked
        ? "This tab is linked to VS Code. New sends reuse it. Click to fill now."
        : "Open the SelectBeam popup, paste the token, Save, then Link this tab.";
      b.style.background = linked ? "#0a7b34" : "#9a6a00";
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

  async function ack(cfg, id) {
    try {
      await fetch(baseUrl(cfg.port) + "/ack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: cfg.token, id: id })
      });
    } catch {
      // ack failed — item stays queued, may refill once. Acceptable.
    }
  }

  function giveUpManual(cfg, item) {
    ack(cfg, item.id);
    delete attempts[item.id];
    if (!toastedManual[item.id]) {
      toastedManual[item.id] = true;
      toast(
        "SelectBeam: couldn't auto-fill this chat box (site layout may have changed). " +
        "Your code IS copied — press " + (navigator.platform.indexOf("Mac") !== -1 ? "Cmd+V" : "Ctrl+V") +
        " in the chat box. (" + (item.fileRef || PROVIDER) + ")"
      );
    }
  }

  async function poll(cfg) {
    if (!cfg.token) {
      return;
    }
    var data;
    try {
      var r = await fetch(
        baseUrl(cfg.port) + "/pending?token=" + encodeURIComponent(cfg.token) +
        "&provider=" + encodeURIComponent(PROVIDER)
      );
      if (!r.ok) {
        return;
      }
      data = await r.json();
    } catch {
      return; // bridge down — silent, heartbeat will relink later
    }
    var items = (data && data.items) || [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var box = findChatBox();
      if (!box) {
        attempts[item.id] = (attempts[item.id] || 0) + 1;
        if (attempts[item.id] === 2 && !toastedNoBox[item.id]) {
          toastedNoBox[item.id] = true;
          toast("SelectBeam: code arrived but the chat box isn't ready — keeping it queued, it will fill when the editor loads.");
        }
        if (attempts[item.id] > MAX_ATTEMPTS) {
          giveUpManual(cfg, item);
        }
        break; // same box for all items — retry next poll
      }
      var text = (i > 0 ? "\n\n" : "") + item.text;
      if (pasteIntoBox(box, text)) {
        delete attempts[item.id];
        await ack(cfg, item.id);
        toast("SelectBeam filled code (" + (item.fileRef || PROVIDER) + ") — review & submit yourself.");
      } else {
        attempts[item.id] = (attempts[item.id] || 0) + 1;
        if (attempts[item.id] > MAX_ATTEMPTS) {
          giveUpManual(cfg, item);
        }
        break; // retry next poll (~2s) until budget runs out
      }
    }
  }

  var cfgCache = null;
  async function tick() {
    cfgCache = await loadCfg();
    if (!cfgCache.token) {
      showBadge(false);
      return; // not linked yet — user must paste token in popup first
    }
    var linked = await heartbeat(cfgCache);
    showBadge(linked);
    if (linked) {
      await poll(cfgCache);
    }
  }

  // Immediate link attempt, then steady beat. Extra triggers cover SPA
  // navigation (URL/title change without reload) and editor late-load:
  // observe DOM, re-poll right when the chat box appears.
  tick();
  setInterval(tick, Math.max(POLL_MS, 1500));
  setInterval(function () {
    if (cfgCache && cfgCache.token) {
      heartbeat(cfgCache);
    }
  }, HEARTBEAT_MS);

  var lastTitle = document.title;
  var pollQueued = false;
  function pollSoon() {
    if (pollQueued || !cfgCache || !cfgCache.token) {
      return;
    }
    pollQueued = true;
    setTimeout(function () {
      pollQueued = false;
      if (document.title !== lastTitle) {
        lastTitle = document.title;
        heartbeat(cfgCache);
      }
      poll(cfgCache);
    }, 1000);
  }
  try {
    new MutationObserver(pollSoon).observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  } catch {
    // observer unsupported — intervals still cover it
  }
  window.addEventListener("focus", function () {
    if (cfgCache && cfgCache.token) {
      poll(cfgCache);
    }
  });
})();
