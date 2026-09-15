// SelectBeam Bridge — content script (one file, all providers).
// Runs on ChatGPT, Claude, Gemini, DeepSeek, Grok, Copilot chat pages.
// It NEVER talks to the bridge directly: all networking goes through the
// background page (whose requests carry the extension Origin the server
// trusts). This script only finds chat boxes, pastes verifiably, and
// reports. Zero setup — no token, no pairing.
//
//   tick: tell background "I am this chat tab" (heartbeat) + "anything
//         for me?" (poll) -> inject queued code -> confirm pickup.
// Paste, never send: only fills the chat box; you press Enter yourself.

(function () {
  "use strict";

  var HEARTBEAT_MS = 15000;
  var POLL_MS = 2000;
  // How many polls (~2s each) we retry a failed paste before giving up and
  // asking for a manual paste. ~15 tries ~= 30 seconds (covers cold loads).
  var MAX_ATTEMPTS = 15;
  // Brave-only: longer budget (~60s). execCommand('insertText') is disabled
  // earlier in Brave than in Chrome/Edge, and Gemini's rich-textarea input
  // lives in a shadow DOM, so first paints need more polls. Non-Brave
  // browsers keep MAX_ATTEMPTS exactly — this changes nothing for them.
  var BRAVE_MAX_ATTEMPTS = 30;
  var IS_BRAVE = (function () {
    try {
      if (navigator.brave && typeof navigator.brave.isBrave === "function") {
        return true;
      }
    } catch (e) { /* fall through to UA check */ }
    try {
      return /Brave/i.test(navigator.userAgent || "") ||
        /Brave/i.test(navigator.vendor || "");
    } catch (e) {
      return false;
    }
  })();
  function maxAttempts() {
    return IS_BRAVE ? BRAVE_MAX_ATTEMPTS : MAX_ATTEMPTS;
  }
  function braveDebug() {
    if (!IS_BRAVE || typeof console === "undefined" || !console.debug) {
      return;
    }
    try {
      console.debug.apply(console, ["[selectbeam:brave]"].concat([].slice.call(arguments)));
    } catch (e) { /* logging never breaks paste */ }
  }

  function getApi() {
    if (typeof browser !== "undefined" && browser.runtime) {
      return browser;
    }
    return chrome;
  }
  var api = getApi();

  // Promise-safe sendMessage (Firefox returns a promise, Chrome needs a
  // callback — this covers both).
  function sendMsg(msg) {
    try {
      var p = api.runtime.sendMessage(msg);
      if (p && typeof p.then === "function") {
        return p;
      }
    } catch {
      // fall through to callback style
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

  function detectProvider() {
    var h = location.hostname;
    var path = location.pathname || "";
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
    if (h.indexOf("grok.com") !== -1) {
      return "grok";
    }
    if (h.indexOf("x.com") !== -1 && path.indexOf("/i/grok") === 0) {
      return "grok";
    }
    if (h.indexOf("copilot.microsoft.com") !== -1) {
      return "copilot";
    }
    return null;
  }

  var PROVIDER = detectProvider();
  if (!PROVIDER) {
    return;
  }

  // Per-site chat-box selectors, most-specific first. The generic
  // role/visibility fallback at the end covers redesigns and new models:
  // chat inputs are big visible editables. If autofill stops after a site
  // update, this table is the ONLY thing that needs new entries.
  var SELECTORS = {
    chatgpt: [
      "#prompt-textarea",
      "[data-testid='prompt-textarea']",
      "div.ProseMirror",
      "div[role='textbox']",
      "form div[contenteditable='true']",
      "div[contenteditable='true']",
      "form textarea",
      "textarea"
    ],
    claude: [
      "[data-testid='chat-input']",
      "div[role='textbox']",
      "div[contenteditable='true']",
      "textarea"
    ],
    gemini: [
      "rich-textarea div[contenteditable='true']",
      "rich-textarea",
      "div[role='textbox']",
      "div[contenteditable='true']",
      "textarea"
    ],
    deepseek: [
      "#chat-input",
      "div[role='textbox']",
      "textarea",
      "div[contenteditable='true']"
    ],
    grok: [
      "div[role='textbox']",
      "div[contenteditable='true']",
      "textarea"
    ],
    copilot: [
      "div[role='textbox']",
      "div[contenteditable='true']",
      "textarea"
    ]
  };

  // attempts[id] = number of failed paste tries for a queued item.
  var attempts = {};
  // Toasted flags so we only nag once per item.
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
      : el.querySelector("div[contenteditable='true'], [contenteditable='plaintext-only'], div[role='textbox'], textarea");
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
    var list = SELECTORS[PROVIDER] || ["div[role='textbox']", "textarea", "div[contenteditable='true']"];
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

  // ---- Brave-only: shadow-DOM-piercing search (Gemini rich-textarea) ----
  // document.querySelectorAll cannot see inside shadow roots. Non-Brave
  // browsers never call this — findChatBox() above is byte-identical.
  function queryAllDeep(root, selector, out) {
    out = out || [];
    var els;
    try {
      els = root.querySelectorAll(selector);
    } catch (e) {
      els = [];
    }
    for (var k = 0; k < els.length; k++) {
      out.push(els[k]);
    }
    var all;
    try {
      all = root.querySelectorAll("*");
    } catch (e) {
      return out;
    }
    for (var n = 0; n < all.length; n++) {
      var sr = null;
      try {
        sr = all[n].shadowRoot;
      } catch (e) {
        sr = null;
      }
      if (sr) {
        queryAllDeep(sr, selector, out);
      }
    }
    return out;
  }

  function shadowInnerEditable(el) {
    // A wrapper (e.g. <rich-textarea>) whose real editor is in its shadow.
    var sr = null;
    try {
      sr = el.shadowRoot;
    } catch (e) {
      sr = null;
    }
    if (!sr || !sr.querySelector) {
      return null;
    }
    return sr.querySelector(
      "div[contenteditable='true'], [contenteditable='plaintext-only'], " +
      "div[role='textbox'], textarea"
    );
  }

  function findChatBoxBrave() {
    var list = SELECTORS[PROVIDER] || ["div[role='textbox']", "textarea", "div[contenteditable='true']"];
    var best = null;
    var bestArea = 0;
    for (var i = 0; i < list.length; i++) {
      var els = queryAllDeep(document, list[i]);
      for (var j = 0; j < els.length; j++) {
        var shadowEd = shadowInnerEditable(els[j]);
        var cand = unwrap(shadowEd || els[j]);
        if (!cand || !isVisible(cand)) {
          continue;
        }
        if (cand !== els[j] || shadowEd) {
          return cand; // drilled into a real inner editor — trust it
        }
        var a = area(cand);
        if (!best || a > bestArea) {
          best = cand;
          bestArea = a;
        }
      }
      if (best && i < 2) {
        return best;
      }
    }
    return best;
  }

  // Brave: deep search first, shared search as fallback. Non-Brave: shared
  // search only, exactly as before.
  function resolveBox() {
    if (!IS_BRAVE) {
      return findChatBox();
    }
    var deep = null;
    try {
      deep = findChatBoxBrave();
    } catch (e) {
      deep = null;
    }
    if (deep) {
      return deep;
    }
    return findChatBox();
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

  // ---- Brave-only: model-aware insert (ProseMirror/Lexical/Slate) ----
  // Brave disables document.execCommand('insertText') earlier than
  // Chrome/Edge, so Strategy 1 fails and the raw text-node append (Strategy
  // 3) is rejected by the editor model. This dispatches the beforeinput +
  // input events with inputType 'insertText' that these editors actually
  // listen for, with the caret placed in the deepest paragraph. Falls back
  // to the shared pipeline — never replaces it. Non-Brave never calls this.
  function deepestEditableNode(el) {
    if (!el || !el.querySelector) {
      return el;
    }
    var inner = el.querySelector(
      "p, div[data-lexical-text='true'], div[data-slate-node='text'], " +
      "div.ProseMirror p, span[data-lexical-text='true']"
    );
    return inner || el;
  }

  function tryBraveInputEvent(el, text) {
    var tag = (el.tagName || "").toLowerCase();
    if (tag === "textarea" || tag === "input") {
      return false; // native setter path covers these; don't interfere
    }
    try {
      var target = deepestEditableNode(el);
      target.focus();
      var sel = window.getSelection();
      var range = document.createRange();
      range.selectNodeContents(target);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      var before = null;
      try {
        before = new InputEvent("beforeinput", {
          bubbles: true, cancelable: true, inputType: "insertText", data: text
        });
      } catch (e) {
        before = new Event("beforeinput", { bubbles: true, cancelable: true });
      }
      target.dispatchEvent(before);
      var evt = null;
      try {
        evt = new InputEvent("input", {
          bubbles: true, inputType: "insertText", data: text
        });
      } catch (e) {
        evt = new Event("input", { bubbles: true });
      }
      // Insert via the Selection API so the editor model observes a real
      // mutation, then notify listeners. If the editor vetoes (cancelled
      // beforeinput), verified() fails and the caller retries.
      var cancelled = before && before.defaultPrevented;
      if (!cancelled) {
        range.insertNode(document.createTextNode(text));
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      target.dispatchEvent(evt);
      el.scrollTop = el.scrollHeight;
      var ok = verified(el, text);
      braveDebug("tryBraveInputEvent", PROVIDER, tag, ok ? "ok" : "miss");
      return ok;
    } catch (e) {
      braveDebug("tryBraveInputEvent error", String((e && e.message) || e));
      return false;
    }
  }

  function pasteIntoBoxBrave(el, text) {
    if (tryBraveInputEvent(el, text)) {
      return true;
    }
    return pasteIntoBox(el, text); // shared pipeline as fallback
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

  // Green = linked, amber = bridge unreachable. Click = fill now.
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
          pollNow();
        });
        document.body.appendChild(b);
      }
      b.textContent = linked ? "SelectBeam linked ✓" : "SelectBeam: VS Code bridge off?";
      b.title = linked
        ? "This tab is linked to VS Code. New sends reuse it. Click to fill now."
        : "Is VS Code open with SelectBeam running? Click to retry.";
      b.style.background = linked ? "#0a7b34" : "#9a6a00";
    } catch {
      // ignore
    }
  }

  function tabInfo() {
    return {
      provider: PROVIDER,
      url: location.href.slice(0, 500),
      title: document.title.slice(0, 200)
    };
  }

  async function heartbeat() {
    try {
      var res = await sendMsg({ type: "hb", ...tabInfo() });
      return !!(res && res.ok && res.linked);
    } catch {
      return false; // background unreachable — retry next beat
    }
  }

  async function ack(id) {
    try {
      await sendMsg({ type: "ack", id: id });
    } catch {
      // ack failed — item stays queued, may refill once. Acceptable.
    }
  }

  function giveUpManual(item) {
    // Brave-only: NEVER drop the queue — Shields/logged-out landings can
    // delay the editor past the budget. Keep the item queued so the next
    // poll or badge click still fills it. Other browsers: unchanged below.
    if (IS_BRAVE) {
      attempts[item.id] = BRAVE_MAX_ATTEMPTS; // cap, keep retrying silently
      if (!toastedManual[item.id]) {
        toastedManual[item.id] = true;
        toast(
          "SelectBeam (Brave): still trying to fill this chat — " +
          "Shields down + logged in works best. Your code IS copied — press " +
          (navigator.platform.indexOf("Mac") !== -1 ? "Cmd+V" : "Ctrl+V") +
          " if needed, or click the green badge to retry. (" + (item.fileRef || PROVIDER) + ")",
          8000
        );
      }
      braveDebug("keep-queued", item.id, PROVIDER);
      return;
    }
    ack(item.id);
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

  async function pollNow() {
    var items = [];
    try {
      var res = await sendMsg({ type: "poll", provider: PROVIDER });
      items = (res && res.items) || [];
    } catch {
      return; // bridge down — silent, heartbeat will relink later
    }
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var box = resolveBox();
      if (!box) {
        attempts[item.id] = (attempts[item.id] || 0) + 1;
        if (attempts[item.id] === 2 && !toastedNoBox[item.id]) {
          toastedNoBox[item.id] = true;
          toast("SelectBeam: code arrived but the chat box isn't ready — keeping it queued, it will fill when the editor loads.");
        }
        if (attempts[item.id] > maxAttempts()) {
          giveUpManual(item);
        }
        break; // same box for all items — retry next poll
      }
      var text = (i > 0 ? "\n\n" : "") + item.text;
      var filledOk = IS_BRAVE ? pasteIntoBoxBrave(box, text) : pasteIntoBox(box, text);
      if (filledOk) {
        delete attempts[item.id];
        await ack(item.id);
        toast("SelectBeam filled code (" + (item.fileRef || PROVIDER) + ") — review & submit yourself.");
        // Tell VS Code it landed: it refreshes the remembered tab and
        // messages you back there. Best-effort — the code is in regardless.
        void sendMsg({ type: "filled", provider: PROVIDER, fileRef: item.fileRef || "" });
        // Brave-only: bring the filled tab to front (asked Yes). The
        // background owns tab focus; content can only request it.
        if (IS_BRAVE) {
          try {
            await sendMsg({ type: "focusTab" });
          } catch (e) { /* focus is best-effort; fill already landed */ }
        }
      } else {
        attempts[item.id] = (attempts[item.id] || 0) + 1;
        if (attempts[item.id] > maxAttempts()) {
          giveUpManual(item);
        }
        break; // retry next poll until budget runs out
      }
    }
  }

  async function tick() {
    var linked = await heartbeat();
    showBadge(linked);
    if (linked) {
      await pollNow();
    }
  }

  // Immediate link attempt, then steady beat. Extra triggers cover SPA
  // navigation (URL/title change without reload) and editor late-load:
  // observe DOM, re-poll right when the chat box appears.
  tick();
  setInterval(tick, Math.max(POLL_MS, 1500));
  setInterval(heartbeat, HEARTBEAT_MS);

  var lastTitle = document.title;
  var pollQueued = false;
  function pollSoon() {
    if (pollQueued) {
      return;
    }
    pollQueued = true;
    setTimeout(function () {
      pollQueued = false;
      if (document.title !== lastTitle) {
        lastTitle = document.title;
        heartbeat().then(function (linked) {
          showBadge(linked);
        });
      }
      pollNow();
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
  window.addEventListener("focus", pollNow);
  // Navigating away from the chat (or closing the tab): tell VS Code to
  // forget this tab NOW, so the next send opens a fresh chat. The
  // background's onRemoved is the primary path; this is the backup.
  window.addEventListener("pagehide", function () {
    try {
      sendMsg({ type: "bye", provider: PROVIDER });
    } catch {
      // unloading — nothing more we can do
    }
  });
})();
