(function () {
  "use strict";

  var HEARTBEAT_MS = 15000;
  var POLL_MS = 2000;
  var MAX_ATTEMPTS = 15;
  var BRAVE_MAX_ATTEMPTS = 30;
  var IS_BRAVE = (function () {
    try {
      if (navigator.brave && typeof navigator.brave.isBrave === "function") {
        return true;
      }
    } catch (e) {}
    try {
      return /Brave/i.test(navigator.userAgent || "") || /Brave/i.test(navigator.vendor || "");
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
    } catch (e) {}
  }

  function getApi() {
    if (typeof browser !== "undefined" && browser.runtime) {
      return browser;
    }
    return chrome;
  }
  var api = getApi();

  function sendMsg(msg) {
    try {
      var p = api.runtime.sendMessage(msg);
      if (p && typeof p.then === "function") {
        return p;
      }
    } catch {}
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
    if (h.indexOf("chatgpt.com") !== -1) { return "chatgpt"; }
    if (h.indexOf("claude.ai") !== -1) { return "claude"; }
    if (h.indexOf("gemini.google.com") !== -1) { return "gemini"; }
    if (h.indexOf("deepseek.com") !== -1) { return "deepseek"; }
    if (h.indexOf("grok.com") !== -1) { return "grok"; }
    if (h.indexOf("x.com") !== -1 && path.indexOf("/i/grok") === 0) { return "grok"; }
    if (h.indexOf("copilot.microsoft.com") !== -1) { return "copilot"; }
    return null;
  }

  var PROVIDER = detectProvider();
  if (!PROVIDER) {
    return;
  }

  var SELECTORS = {
    chatgpt: ["#prompt-textarea", "[data-testid='prompt-textarea']", "div.ProseMirror", "div[role='textbox']",
      "form div[contenteditable='true']", "div[contenteditable='true']", "form textarea", "textarea"],
    claude: ["[data-testid='chat-input']", "div[role='textbox']", "div[contenteditable='true']", "textarea"],
    gemini: ["rich-textarea div[contenteditable='true']", "rich-textarea", "div[role='textbox']",
      "div[contenteditable='true']", "textarea"],
    deepseek: ["#chat-input", "div[role='textbox']", "textarea", "div[contenteditable='true']"],
    grok: ["div[role='textbox']", "div[contenteditable='true']", "textarea"],
    copilot: ["div[role='textbox']", "div[contenteditable='true']", "textarea"]
  };

  var attempts = {};
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

  function unwrap(el) {
    if (!el || !el.querySelector) {
      return el;
    }
    var tag = (el.tagName || "").toLowerCase();
    var editable = tag === "textarea" || tag === "input" ? null
      : el.querySelector("div[contenteditable='true'], [contenteditable='plaintext-only'], div[role='textbox'], textarea");
    return (editable && editable !== el) ? editable : el;
  }

  function area(el) {
    try {
      var r = el.getBoundingClientRect();
      return Math.max(0, r.width) * Math.max(0, r.height);
    } catch {
      return 0;
    }
  }

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
        return best;
      }
    }
    return best;
  }

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
    var sr = null;
    try {
      sr = el.shadowRoot;
    } catch (e) {
      sr = null;
    }
    if (!sr || !sr.querySelector) {
      return null;
    }
    return sr.querySelector("div[contenteditable='true'], [contenteditable='plaintext-only'], div[role='textbox'], textarea");
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
          return cand;
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
    return deep || findChatBox();
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
      } catch {}
    }
  }

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

  function tryAppendText(el, text) {
    var tag = (el.tagName || "").toLowerCase();
    if (tag === "textarea" || tag === "input") {
      return false;
    }
    try {
      el.focus();
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
    return tryExecInsert(el, text) || tryNativeSetter(el, text) || tryAppendText(el, text);
  }

  function deepestEditableNode(el) {
    if (!el || !el.querySelector) {
      return el;
    }
    var inner = el.querySelector("p, div[data-lexical-text='true'], div[data-slate-node='text'], div.ProseMirror p, span[data-lexical-text='true']");
    return inner || el;
  }

  function inputEventOf(type, text) {
    try {
      return new InputEvent(type, { bubbles: true, cancelable: true, inputType: "insertText", data: text });
    } catch (e) {
      return new Event(type, { bubbles: true, cancelable: true });
    }
  }

  function tryBraveInputEvent(el, text) {
    var tag = (el.tagName || "").toLowerCase();
    if (tag === "textarea" || tag === "input") {
      return false;
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
      var before = inputEventOf("beforeinput", text);
      target.dispatchEvent(before);
      if (!before.defaultPrevented) {
        range.insertNode(document.createTextNode(text));
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      target.dispatchEvent(inputEventOf("input", text));
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
    return tryBraveInputEvent(el, text) || pasteIntoBox(el, text);
  }

  function toast(msg, ms) {
    try {
      var old = document.getElementById("selectbeam-toast");
      if (old) {
        old.remove();
      }
      var d = document.createElement("div");
      d.id = "selectbeam-toast";
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
    } catch {}
  }

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
    } catch {}
  }

  function tabInfo() {
    return { provider: PROVIDER, url: location.href.slice(0, 500), title: document.title.slice(0, 200) };
  }

  async function heartbeat() {
    try {
      var res = await sendMsg({ type: "hb", ...tabInfo() });
      return !!(res && res.ok && res.linked);
    } catch {
      return false;
    }
  }

  async function ack(id) {
    try {
      await sendMsg({ type: "ack", id: id });
    } catch {}
  }

  function pasteKey() {
    try {
      return navigator.platform.indexOf("Mac") !== -1 ? "Cmd+V" : "Ctrl+V";
    } catch (e) {
      return "Ctrl+V";
    }
  }

  function giveUpManual(item) {
    if (IS_BRAVE) {
      attempts[item.id] = BRAVE_MAX_ATTEMPTS;
      if (!toastedManual[item.id]) {
        toastedManual[item.id] = true;
        toast(
          "SelectBeam (Brave): still trying to fill this chat — " +
          "Shields down + logged in works best. Your code IS copied — press " +
          pasteKey() + " if needed, or click the green badge to retry. (" + (item.fileRef || PROVIDER) + ")",
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
        "Your code IS copied — press " + pasteKey() + " in the chat box. (" + (item.fileRef || PROVIDER) + ")"
      );
    }
  }

  async function fillOne(item, text) {
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
      return false;
    }
    var ok = IS_BRAVE ? pasteIntoBoxBrave(box, text) : pasteIntoBox(box, text);
    if (!ok) {
      attempts[item.id] = (attempts[item.id] || 0) + 1;
      if (attempts[item.id] > maxAttempts()) {
        giveUpManual(item);
      }
      return false;
    }
    delete attempts[item.id];
    await ack(item.id);
    toast("SelectBeam filled code (" + (item.fileRef || PROVIDER) + ") — review & submit yourself.");
    void sendMsg({ type: "filled", provider: PROVIDER, fileRef: item.fileRef || "" });
    if (IS_BRAVE) {
      try {
        await sendMsg({ type: "focusTab" });
      } catch (e) {}
    }
    return true;
  }

  async function pollNow() {
    var items = [];
    try {
      var res = await sendMsg({ type: "poll", provider: PROVIDER });
      items = (res && res.items) || [];
    } catch {
      return;
    }
    for (var i = 0; i < items.length; i++) {
      if (!(await fillOne(items[i], (i > 0 ? "\n\n" : "") + items[i].text))) {
        break;
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
    new MutationObserver(pollSoon).observe(document.documentElement, { childList: true, subtree: true });
  } catch {}
  window.addEventListener("focus", pollNow);
  window.addEventListener("pagehide", function () {
    try {
      sendMsg({ type: "bye", provider: PROVIDER });
    } catch {}
  });
})();
