(() => {
  // Enable verbose logging to debug infinite loading issues
  const DEBUG = true;
  const log = (...args) => { try { if (DEBUG) console.log("[GPT Boost]", ...args); } catch (_) {} };

  const DEFAULTS = Object.freeze({
    maxVisible: 10,         // show at most last N messages
    batchSize: 10,          // number of messages to reveal/hide in a batch
    autoloadOnScroll: true, // reveal older messages when user scrolls to top
  });

  let settings = { ...DEFAULTS };

  // Utility: get settings from storage
  function loadSettings() {
    log("loadSettings: start");
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get(DEFAULTS, (res) => {
          settings = { ...DEFAULTS, ...res };
          log("loadSettings: resolved from chrome.storage.sync", settings);
          resolve(settings);
        });
      } catch (e) {
        // Firefox/quasi environments might not have chrome.*; fallback to defaults
        settings = { ...DEFAULTS };
        log("loadSettings: using DEFAULTS due to error", e);
        resolve(settings);
      }
    });
  }

  // Observe storage changes to update live
  function watchSettings() {
    log("watchSettings: attaching listener");
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        log("storage.onChanged", { area, changes });
        if (area !== "sync") return;
        let changed = false;
        for (const k of Object.keys(DEFAULTS)) {
          if (k in changes) {
            settings[k] = changes[k].newValue;
            changed = true;
          }
        }
        if (changed) {
          log("Settings changed -> re-apply", settings);
          scheduleApplyWindowing("settings changed"); // re-apply
        }
      });
    } catch (e) {
      log("watchSettings: failed to attach listener", e);
    }
  }

  // Candidate selectors for the conversation container & message nodes
  const CONTAINER_SELECTORS = [
    'main div[data-testid="conversation"]',
    'main div[data-tab="conversation"]',
    'main div:has(> div[data-testid^="conversation-turn"])',
    'main div.flex.flex-col:has([data-message-author-role])',
    'main[role="main"]',
    'main'
  ];

  const MESSAGE_SELECTORS = [
    '[data-testid^="conversation-turn"]',
    '[data-message-author-role]',
    'article[data-message-author-role]',
    'div[data-message-id]',
    'div[data-testid="message"]'
  ];

  // Internal state
  let container = null;
  let observer = null;
  let lastAppliedOnPath = null;

  // A simple state model of which messages are hidden
  let hiddenCountTop = 0; // number of hidden messages at the top
  let hiddenCountBottom = 0; // (we typically don't hide bottom)

  let topSentinel = null;
  let uiBar = null;

  // Find the main scrollable container
  function findContainer() {
    for (const sel of CONTAINER_SELECTORS) {
      const node = document.querySelector(sel);
      if (node) { log("findContainer: matched selector", sel, node); return node; }
    }
    log("findContainer: no container found; using fallback later");
    return null;
  }

  function isOnChatPage() {
    // crude heuristic: presence of textarea / composer or new chat button
    return !!document.querySelector('textarea, [data-testid="composer"], [data-testid="send-button"]');
  }

  function collectMessages() {
    const nodes = new Set();
    MESSAGE_SELECTORS.forEach(sel => {
      const found = document.querySelectorAll(sel);
      log("collectMessages: selector", sel, "found", found.length);
      found.forEach(n => nodes.add(n));
    });

    // Filter: ensure node is within the container (if we found one)
    let arr = [...nodes].filter(n => !container || container.contains(n));

    // Remove nested duplicates: keep highest-level message nodes
    const set = new Set(arr);
    arr = arr.filter(n => {
      let p = n.parentElement;
      while (p && p !== container && p !== document.body) {
        if (set.has(p)) return false;
        p = p.parentElement;
      }
      return true;
    });

    // Sort by document order
    arr.sort((a, b) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    log("collectMessages: final count", arr.length);
    return arr;
  }

  function ensureUI() {
    if (!container) return;
    if (!uiBar) {
      log("ensureUI: creating UI bar");
      uiBar = document.createElement("div");
      uiBar.className = "gpt-boost-bar";
      const pill = document.createElement("div");
      pill.className = "gpt-boost-pill";
      pill.innerHTML = `
        <span id="gpt-boost-status">GPT Boost active</span>
        <button id="gpt-boost-show-older" title="Show older messages">Show older</button>
        <button id="gpt-boost-collapse" title="Collapse older messages">Collapse</button>
      `;
      uiBar.appendChild(pill);
      container.prepend(uiBar);

      pill.querySelector("#gpt-boost-show-older").addEventListener("click", () => { log("UI: Show older clicked"); revealOlder(); });
      pill.querySelector("#gpt-boost-collapse").addEventListener("click", () => { log("UI: Collapse clicked"); collapseToThreshold(); });
    }

    if (!topSentinel) {
      log("ensureUI: creating top sentinel");
      topSentinel = document.createElement("div");
      topSentinel.className = "gpt-boost-sentinel";
      container.prepend(topSentinel);
      if (settings.autoloadOnScroll) {
        const io = new IntersectionObserver((entries) => {
          for (const e of entries) {
            if (e.isIntersecting) {
              log("IntersectionObserver: top sentinel intersecting → revealOlder");
              revealOlder();
            }
          }
        }, { root: null, threshold: 0 });
        io.observe(topSentinel);
      }
    }
  }

  function updateStatus(total, visible) {
    const el = document.getElementById("gpt-boost-status");
    if (el) {
      el.textContent = `GPT Boost · visible ${visible}/${total}`;
    }
    log("updateStatus", { total, visible });
  }

  function applyWindowing() {
    log("applyWindowing: start", { path: location.pathname + location.search, hiddenCountTop, hiddenCountBottom, settings });
    if (!isOnChatPage()) { log("applyWindowing: not on chat page -> skip"); return; }
    container = findContainer() || document.querySelector("main") || document.body;
    ensureUI();

    const messages = collectMessages();
    const total = messages.length;

    // Edge case: if no messages yet, do nothing
    if (total === 0) {
      log("applyWindowing: no messages yet");
      updateStatus(0, 0);
      return;
    }

    const threshold = Math.max(1, Number(settings.maxVisible) || DEFAULTS.maxVisible);
    const batchSize = Math.max(1, Number(settings.batchSize) || DEFAULTS.batchSize);
    log("applyWindowing: totals", { total, threshold, batchSize });

    // If we haven't hidden anything yet or messages changed radically, recalc hidden top
    if (hiddenCountTop + threshold > total) {
      hiddenCountTop = Math.max(0, total - threshold);
    } else {
      // Keep hiddenCountTop bounded
      hiddenCountTop = Math.min(hiddenCountTop, Math.max(0, total - threshold));
    }
    log("applyWindowing: hiddenCountTop after calc", hiddenCountTop);

    // Hide top older messages
    let visibleCount = 0;
    messages.forEach((node, idx) => {
      const shouldHide = idx < hiddenCountTop;
      if (node.style.display !== (shouldHide ? "none" : "")) {
        // only log when changing
        log("applyWindowing: set display", { idx, shouldHide });
      }
      node.style.display = shouldHide ? "none" : "";
      if (!shouldHide) visibleCount++;
    });

    // update status
    updateStatus(total, visibleCount);

    // Add or update a placeholder where we cut off
    let placeholder = container.querySelector(".gpt-boost-hidden-placeholder");
    if (hiddenCountTop > 0) {
      if (!placeholder) {
        log("applyWindowing: creating placeholder before index", hiddenCountTop);
        placeholder = document.createElement("div");
        placeholder.className = "gpt-boost-hidden-placeholder";
        placeholder.addEventListener("click", () => revealOlder());
        if (messages[hiddenCountTop]) {
          messages[hiddenCountTop].before(placeholder);
        } else {
          container.appendChild(placeholder);
        }
      }
      placeholder.textContent = `${hiddenCountTop} older message${hiddenCountTop === 1 ? "" : "s"} hidden — click to load`;
    } else {
      if (placeholder) { log("applyWindowing: removing placeholder"); placeholder.remove(); }
    }
  }

  function revealOlder() {
    log("revealOlder: start");
    const messages = collectMessages();
    if (!messages.length) { log("revealOlder: no messages"); return; }

    const batchSize = Math.max(1, Number(settings.batchSize) || DEFAULTS.batchSize);
    const before = hiddenCountTop;
    hiddenCountTop = Math.max(0, hiddenCountTop - batchSize);
    log("revealOlder: hiddenCountTop", { before, after: hiddenCountTop, batchSize, total: messages.length });

    // reveal range [hiddenCountTop, before)
    for (let i = hiddenCountTop; i < before; i++) {
      if (messages[i]) messages[i].style.display = "";
    }
    scheduleApplyWindowing("reveal older");
  }

  function collapseToThreshold() {
    log("collapseToThreshold: start");
    const messages = collectMessages();
    if (!messages.length) { log("collapseToThreshold: no messages"); return; }
    const total = messages.length;
    const threshold = Math.max(1, Number(settings.maxVisible) || DEFAULTS.maxVisible);
    hiddenCountTop = Math.max(0, total - threshold);
    log("collapseToThreshold: computing hiddenCountTop", { total, threshold, hiddenCountTop });
    applyWindowing();
    // Scroll to bottom after collapsing to keep the newest in view
    try {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    } catch (e) { log("collapseToThreshold: scrollTo failed", e); }
  }

  // Simple throttle to prevent applyWindowing from running too frequently
  let applyScheduled = false;
  function scheduleApplyWindowing(reason) {
    if (applyScheduled) { log("scheduleApplyWindowing: already scheduled, reason:", reason); return; }
    applyScheduled = true;
    // micro-burst debounce: group rapid successive mutations into one apply
    setTimeout(() => {
      applyScheduled = false;
      log("scheduleApplyWindowing: running applyWindowing, reason:", reason);
      applyWindowing();
    }, 50);
  }

  function observeDom() {
    if (observer) { log("observeDom: disconnecting previous observer"); observer.disconnect(); }
    observer = new MutationObserver((mutations) => {
      // Re-apply when conversation content changes
      let shouldApply = false;
      for (const m of mutations) {
        if (m.type === "childList" || m.type === "attributes") {
          shouldApply = true;
          break;
        }
      }
      if (shouldApply) {
        log("MutationObserver: relevant mutation -> scheduleApplyWindowing");
        scheduleApplyWindowing("mutation");
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-message-author-role", "data-testid", "class"] });
    log("observeDom: observer attached to documentElement");
  }

  function handleRouteChanges() {
    const path = location.pathname + location.search;
    if (path !== lastAppliedOnPath) {
      log("handleRouteChanges: route changed", { from: lastAppliedOnPath, to: path });
      lastAppliedOnPath = path;
      hiddenCountTop = 0;
      hiddenCountBottom = 0;
      setTimeout(() => { log("handleRouteChanges: applying after delay"); scheduleApplyWindowing("route change"); }, 250);
    } else {
      log("handleRouteChanges: same path -> no-op", path);
    }
  }

  async function init() {
    log("init: start");
    await loadSettings();
    log("init: settings loaded", settings);
    watchSettings();
    observeDom();
    handleRouteChanges();
    scheduleApplyWindowing("init");

    // Also watch for SPA navigation
    const pushState = history.pushState;
    const replaceState = history.replaceState;
    history.pushState = function() {
      log("history.pushState intercepted", arguments);
      pushState.apply(this, arguments);
      handleRouteChanges();
    };
    history.replaceState = function() {
      log("history.replaceState intercepted", arguments);
      replaceState.apply(this, arguments);
      handleRouteChanges();
    };
    window.addEventListener("popstate", handleRouteChanges);
    log("init: listeners attached, ready");
    // throttle scroll-based autoload if needed (we rely on IntersectionObserver for topSentinel)
  }

  // kick off
  if (document.readyState === "loading") {
    log("bootstrap: DOM loading -> waiting for DOMContentLoaded");
    document.addEventListener("DOMContentLoaded", init);
  } else {
    log("bootstrap: DOM already ready -> init now");
    init();
  }
})();
