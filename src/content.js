(() => {
    // Enable verbose logging to debug infinite loading issues
    const DEBUG = false;
    const log = (...args) => {
        try {
            if (DEBUG) console.log("[GPT Boost]", ...args);
        } catch (_) {
        }
    };

    const DEFAULTS = Object.freeze({
        maxVisible: 10,         // show at most last N messages
        batchSize: 10,          // number of messages to reveal/hide in a batch
        autoloadOnScroll: true, // reveal older messages when user scrolls to top
        hideOldestOnNew: true,  // hide oldest visible message when new ones arrive
    });

    let settings = {...DEFAULTS};
    let visibleLimit = DEFAULTS.maxVisible; // dynamic visible count when auto-hiding on new

    // Utility: get settings from storage
    function loadSettings() {
        log("loadSettings: start");
        return new Promise((resolve) => {
            try {
                chrome.storage.sync.get(DEFAULTS, (res) => {
                    settings = {...DEFAULTS, ...res};
                    visibleLimit = settings.maxVisible;
                    log("loadSettings: resolved from chrome.storage.sync", settings);
                    resolve(settings);
                });
            } catch (e) {
                // Firefox/quasi environments might not have chrome.*; fallback to defaults
                settings = {...DEFAULTS};
                visibleLimit = settings.maxVisible;
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
                log("storage.onChanged", {area, changes});
                if (area !== "sync") return;
                let changed = false;
                for (const k of Object.keys(DEFAULTS)) {
                    if (k in changes) {
                        settings[k] = changes[k].newValue;
                        if (k === 'maxVisible') visibleLimit = settings.maxVisible;
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
    let threadContainer = null;
    let observer = null;
    let lastAppliedOnPath = null;

    // A simple state model of which messages are hidden
    let hiddenCountTop = 0; // number of hidden messages at the top
    let hiddenCountBottom = 0; // (we typically don't hide bottom)

    let topSentinel = null;
    let uiBar = null;

    // Cache of last applied state to avoid redundant DOM writes
    let lastApply = {total: null, hiddenTop: null};
    let currentStatus = {total: null, hiddenTop: null};
    let sawZeroThenGrew = false; // detect chat reload: total 0 -> >0 transition

    // Find the main container
    function findContainer() {
        for (const sel of CONTAINER_SELECTORS) {
            const node = document.querySelector(sel);
            if (node) {
                log("findContainer: matched selector", sel, node);
                return node;
            }
        }
        log("findContainer: no container found; using fallback later");
        return null;
    }

    // Find the thread scrollable container
    function findThreadContainer() {
        let elements = document.getElementsByClassName('thread-xl:pt-header-height');
        if (elements.length > 0) {
            return elements[0];
        }
        log("findThreadContainer: no container found");
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
        // Only show on conversation URLs like /share/* or /c/*
        if (!/\/(share|c)\//.test(location.pathname)) {
            uiBar?.remove();
            uiBar = null;
            return;
        }
        // Ensure container for sentinel, but UI bar is mounted on body so it survives SPA re-renders
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
        <span class="gpt-boost-drag-handle" title="Drag">
          <span class="gpt-boost-drag-dot"></span>
          <span class="gpt-boost-drag-dot"></span>
          <span class="gpt-boost-drag-dot"></span>
          <span class="gpt-boost-drag-dot"></span>
          <span class="gpt-boost-drag-dot"></span>
          <span class="gpt-boost-drag-dot"></span>
        </span>
      `;
            uiBar.appendChild(pill);
            (document.body || document.documentElement).appendChild(uiBar);

            pill.querySelector("#gpt-boost-show-older").addEventListener("click", () => {
                log("UI: Show older clicked");
                revealOlder();
            });
            pill.querySelector("#gpt-boost-collapse").addEventListener("click", () => {
                log("UI: Collapse clicked");
                collapseToThreshold();
            });

            // Dragging: only via the handle on the right edge
            const handle = pill.querySelector('.gpt-boost-drag-handle');
            if (handle && !pill.dataset.dragInit) {
                pill.dataset.dragInit = '1';
                let dragging = false;
                let startX = 0, startY = 0;
                let offsetX = 0, offsetY = 0;

                const clamp = (val, min, max) => Math.min(Math.max(val, min), max);

                const onMove = (clientX, clientY) => {
                    const vw = window.innerWidth;
                    const vh = window.innerHeight;
                    const rect = pill.getBoundingClientRect();
                    const newLeft = clamp(clientX - offsetX, 4, vw - rect.width - 4);
                    const newTop = clamp(clientY - offsetY, 4, vh - rect.height - 4);
                    pill.style.left = `${newLeft}px`;
                    pill.style.top = `${newTop}px`;
                };

                const onMouseMove = (e) => {
                    if (!dragging) return;
                    e.preventDefault();
                    onMove(e.clientX, e.clientY);
                };
                const onTouchMove = (e) => {
                    if (!dragging) return;
                    const t = e.touches[0];
                    if (!t) return;
                    e.preventDefault();
                    onMove(t.clientX, t.clientY);
                };
                const endDrag = () => {
                    if (!dragging) return;
                    dragging = false;
                    document.removeEventListener('mousemove', onMouseMove, {passive: false});
                    document.removeEventListener('mouseup', endDrag);
                    document.removeEventListener('touchmove', onTouchMove, {passive: false});
                    document.removeEventListener('touchend', endDrag);
                    handle.classList.remove('dragging');
                };

                const begin = (clientX, clientY) => {
                    const rect = pill.getBoundingClientRect();
                    // Switch from centered transform to absolute pixel positioning on first drag
                    pill.style.transform = 'none';
                    pill.style.left = `${rect.left}px`;
                    pill.style.top = `${rect.top}px`;
                    offsetX = clientX - rect.left;
                    offsetY = clientY - rect.top;
                    dragging = true;
                    handle.classList.add('dragging');
                    document.addEventListener('mousemove', onMouseMove, {passive: false});
                    document.addEventListener('mouseup', endDrag);
                    document.addEventListener('touchmove', onTouchMove, {passive: false});
                    document.addEventListener('touchend', endDrag);
                };

                handle.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    begin(e.clientX, e.clientY);
                });
                handle.addEventListener('touchstart', (e) => {
                    const t = e.touches[0];
                    if (!t) return;
                    e.preventDefault();
                    begin(t.clientX, t.clientY);
                }, {passive: false});
            }
        } else if (!uiBar.isConnected) {
            log("ensureUI: re-attaching UI bar to body");
            (document.body || document.documentElement).appendChild(uiBar);
        }

        if (threadContainer && !topSentinel) {
            if (settings.autoloadOnScroll) {
                log("ensureUI: creating top sentinel");
                topSentinel = document.createElement("div");
                topSentinel.className = "gpt-boost-sentinel";
                threadContainer.prepend(topSentinel);
                const io = new IntersectionObserver((entries) => {
                    for (const e of entries) {
                        //todo fix bug with initial double reveal
                        if (e.isIntersecting && currentStatus.total > 0 && currentStatus.total !== currentStatus.visible &&
                            threadContainer.parentElement.scrollHeight > threadContainer.parentElement.clientHeight) {
                            log("IntersectionObserver: top sentinel intersecting → revealOlder");
                            revealOlder();
                        }
                    }
                }, {root: null, threshold: 0});
                io.observe(topSentinel);
            }
        }
    }

    function updateStatus(total, visible) {
        currentStatus = {total, visible};
        const el = document.getElementById("gpt-boost-status");
        if (el) {
            el.textContent = `GPT Boost · visible ${visible}/${total}`;
        }
        log("updateStatus", {total, visible});
    }

    function applyWindowing() {
        log("applyWindowing: start", {
            path: location.pathname + location.search,
            hiddenCountTop,
            hiddenCountBottom,
            settings
        });
        if (!isOnChatPage()) {
            log("applyWindowing: not on chat page -> skip");
            return;
        }
        if (!container || !container.isConnected) {
            container = findContainer() || document.querySelector("main") || document.body;
        }
        ensureUI();

        const messages = collectMessages();
        const total = messages.length;

        // Edge case: if no messages yet, do nothing (with backoff)
        if (total === 0) {
            // mark that we saw zero; when it grows we'll auto-collapse
            sawZeroThenGrew = true;
            log("applyWindowing: no messages yet");
            updateStatus(0, 0);
            // do not use timers; rely on DOM changes in #thread (articles count) to trigger windowing
            // status will update once messages appear
            return;
        }

        const threshold = Math.max(1, Number(settings.maxVisible) || DEFAULTS.maxVisible);
        const batchSize = Math.max(1, Number(settings.batchSize) || DEFAULTS.batchSize);
        log("applyWindowing: totals", {total, threshold, batchSize});

        // messages present; proceed normally

        if (settings.hideOldestOnNew) {
            if (visibleLimit < threshold) visibleLimit = threshold;
            hiddenCountTop = Math.max(0, total - visibleLimit);
        } else {
            // If we haven't hidden anything yet or messages changed radically, recalc hidden top
            if (hiddenCountTop + threshold > total) {
                hiddenCountTop = Math.max(0, total - threshold);
            } else {
                // Keep hiddenCountTop bounded
                hiddenCountTop = Math.min(hiddenCountTop, Math.max(0, total - threshold));
            }
        }
        log("applyWindowing: hiddenCountTop after calc", hiddenCountTop);

        // If we just transitioned from 0 -> >0 total, collapse by default once
        if (sawZeroThenGrew && total > 0) {
            log("applyWindowing: detected chat load (0 -> >0). Collapsing to threshold by default");
            sawZeroThenGrew = false; // reset the flag
            // compute hiddenCountTop to collapse now
            const threshold = Math.max(1, Number(settings.maxVisible) || DEFAULTS.maxVisible);
            hiddenCountTop = Math.max(0, total - threshold);
            if (settings.hideOldestOnNew) visibleLimit = threshold;
        }

        // Skip redundant apply if nothing changed
        if (lastApply.total === total && lastApply.hiddenTop === hiddenCountTop) {
            log("applyWindowing: no-op (state unchanged)");
            updateStatus(total, Math.max(0, total - hiddenCountTop));
            return;
        }

        // Hide top older messages
        let visibleCount = 0;
        messages.forEach((node, idx) => {
            const shouldHide = idx < hiddenCountTop;
            if (node.style.display !== (shouldHide ? "none" : "")) {
                // only log when changing
                log("applyWindowing: set display", {idx, shouldHide});
            }
            node.style.display = shouldHide ? "none" : "";
            if (!shouldHide) visibleCount++;
        });

        // update status
        updateStatus(total, visibleCount);

        // Remember last applied state
        lastApply = {total, hiddenTop: hiddenCountTop};

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
            placeholder.textContent = revealOlderText(hiddenCountTop);
        } else {
            if (placeholder) {
                log("applyWindowing: removing placeholder");
                placeholder.remove();
            }
        }
    }

    function revealOlderText(hiddenCountTop) {
        return `${hiddenCountTop} older message${hiddenCountTop === 1 ? "" : "s"} hidden — click to load next ${settings.batchSize}`;
    }

    function revealOlder() {
        log("revealOlder: start");
        const messages = collectMessages();
        if (!messages.length) {
            log("revealOlder: no messages");
            return;
        }

        const batchSize = Math.max(1, Number(settings.batchSize) || DEFAULTS.batchSize);
        const before = hiddenCountTop;
        hiddenCountTop = Math.max(0, hiddenCountTop - batchSize);
        visibleLimit += before - hiddenCountTop;
        log("revealOlder: hiddenCountTop", {before, after: hiddenCountTop, batchSize, total: messages.length});

        let placeholder = container.querySelector(".gpt-boost-hidden-placeholder");
        if (hiddenCountTop > 0) {
            if (placeholder) {
                placeholder.textContent = revealOlderText(hiddenCountTop);
                messages[hiddenCountTop].before(placeholder);
            }
        } else if (placeholder) {
            placeholder.remove();
        }
        // reveal range [hiddenCountTop, before)
        for (let i = hiddenCountTop; i < before; i++) {
            if (messages[i]) messages[i].style.display = "";
        }
        scheduleApplyWindowing("reveal older");
    }

    function collapseToThreshold() {
        log("collapseToThreshold: start");
        const messages = collectMessages();
        if (!messages.length) {
            log("collapseToThreshold: no messages");
            return;
        }
        const total = messages.length;
        const threshold = Math.max(1, Number(settings.maxVisible) || DEFAULTS.maxVisible);
        hiddenCountTop = Math.max(0, total - threshold);
        visibleLimit = threshold;
        log("collapseToThreshold: computing hiddenCountTop", {total, threshold, hiddenCountTop});
        applyWindowing();
        // Scroll to bottom after collapsing to keep the newest in view
        try {
            container.scrollTo({top: container.scrollHeight, behavior: "smooth"});
        } catch (e) {
            log("collapseToThreshold: scrollTo failed", e);
        }
    }

    // Throttle applyWindowing using requestAnimationFrame (no setTimeout)
    let applyScheduled = false;
    let rafId = null;

    function scheduleApplyWindowing(reason) {
        if (applyScheduled) {
            log("scheduleApplyWindowing: already scheduled, reason:", reason);
            return;
        }
        applyScheduled = true;
        rafId = requestAnimationFrame(() => {
            applyScheduled = false;
            rafId = null;
            log("scheduleApplyWindowing: running applyWindowing (rAF), reason:", reason);
            applyWindowing();
        });
    }

    let threadObserver = null;
    let lastArticleCount = null;
    let rootObserver = null;

    function observeDom() {
        if (observer) {
            log("observeDom: disconnecting previous observer");
            observer.disconnect();
        }

        // Try to attach to the conversation container only
        const target = findContainer() || document.querySelector("main");
        if (!target) {
            log("observeDom: no container yet");
            return;
        }
        container = target;
        threadContainer = findThreadContainer();

        // Also observe #thread for article count changes to avoid timers
        const thread = document.querySelector('#thread') || container.querySelector('#thread');
        if (thread) {
            const count = thread.querySelectorAll('article').length;
            lastArticleCount = count;
            if (threadObserver) threadObserver.disconnect();
            threadObserver = new MutationObserver(() => {
                const newCount = thread.querySelectorAll('article').length;
                if (lastArticleCount !== newCount) {
                    log('threadObserver: article count changed', {from: lastArticleCount, to: newCount});
                    lastArticleCount = newCount;
                    scheduleApplyWindowing('thread article count');
                }
                // If thread was replaced, reattach
                if (!thread.isConnected) {
                    log('threadObserver: thread disconnected -> re-observe');
                    observeDom();
                }
            });
            threadObserver.observe(thread, {childList: true, subtree: true});
            log('observeDom: thread observer attached');
        } else {
            log('observeDom: #thread not found; relying on container observer');
        }

        observer = new MutationObserver((mutations) => {
            // If container disconnected, reattach observers
            if (!container || !container.isConnected) {
                log('MutationObserver(container): container disconnected -> re-observe');
                observeDom();
                scheduleApplyWindowing('container replaced');
                return;
            }
            for (const m of mutations) {
                if (m.type === "childList") {
                    log("MutationObserver(container): childList -> scheduleApplyWindowing");
                    scheduleApplyWindowing("container childList");
                    break;
                }
            }
        });
        observer.observe(container, {childList: true, subtree: true});
        log("observeDom: observer attached to container");

        // Root observer to detect container replacement by SPA
        if (!rootObserver) {
            rootObserver = new MutationObserver(() => {
                const newContainer = findContainer() || document.querySelector('main');
                if (newContainer && newContainer !== container) {
                    log('rootObserver: container changed -> reattach');
                    container = newContainer;
                    observeDom();
                    scheduleApplyWindowing('container changed');
                } else if (container && !container.isConnected) {
                    log('rootObserver: container disconnected -> reattach');
                    observeDom();
                    scheduleApplyWindowing('container disconnected');
                }
                // Keep UI bar attached to body if it gets removed by page scripts
                if (uiBar && !uiBar.isConnected) {
                    log('rootObserver: re-attaching UI bar');
                    (document.body || document.documentElement).appendChild(uiBar);
                }
            });
            rootObserver.observe(document.documentElement, {childList: true, subtree: true});
            log('observeDom: root observer attached');
        }
    }

    function handleRouteChanges() {
        const path = location.pathname + location.search;
        if (path !== lastAppliedOnPath) {
            log("handleRouteChanges: route changed", {from: lastAppliedOnPath, to: path});
            lastAppliedOnPath = path;
            hiddenCountTop = 0;
            hiddenCountBottom = 0;
            sawZeroThenGrew = false;
            visibleLimit = settings.maxVisible;
            // reattach observer for new container without timers
            observeDom();
            scheduleApplyWindowing("route change");
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
        history.pushState = function () {
            log("history.pushState intercepted", arguments);
            pushState.apply(this, arguments);
            handleRouteChanges();
        };
        history.replaceState = function () {
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
