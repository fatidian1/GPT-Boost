import { getMessage } from './i18n';

(() => {
  const DEBUG = false;
  const log = (...args) => {
    try {
      if (DEBUG) console.log('[GPT Boost]', ...args);
    } catch (_) {
      // ignore: extension context may be invalidated
    }
  };

  const DEFAULTS = Object.freeze({
    maxVisible: 10,
    batchSize: 10,
    autoloadOnScroll: true,
    hideOldestOnNew: true,
    deleteMessages: false,
    hiddenDomBuffer: 0,
    userMessageMaxHeight: 200,
  });

  let settings = { ...DEFAULTS };

  // Unified state model
  let state = {
    firstVisible: 0, // index of first visible message (0 = show all)
    prunedCount: 0, // messages permanently removed (delete mode)
    lastTotal: 0, // last known total for change detection
  };

  // DOM references
  let container = null;
  let threadContainer = null;
  let mainObserver = null;
  let topSentinel = null;
  let sentinelObserver = null;
  let uiBar = null;

  // ─────────────────────────────────────────────────────────────────
  // Settings
  // ─────────────────────────────────────────────────────────────────
  function loadSettings() {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get(DEFAULTS, (res) => {
          settings = { ...DEFAULTS, ...res };
          log('loadSettings:', settings);
          resolve(settings);
        });
      } catch (e) {
        settings = { ...DEFAULTS };
        resolve(settings);
      }
    });
  }

  function watchSettings() {
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'sync') return;
        for (const k of Object.keys(DEFAULTS)) {
          if (k in changes) settings[k] = changes[k].newValue;
        }
        syncUIState();
        scheduleApply('settings changed');
      });
    } catch (_) {
      // ignore: chrome.storage may not be available
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Selectors
  // ─────────────────────────────────────────────────────────────────
  const CONTAINER_SELECTORS = [
    'main div[data-testid="conversation"]',
    'main div[data-tab="conversation"]',
    'main div:has(> div[data-testid^="conversation-turn"])',
    'main div.flex.flex-col:has([data-message-author-role])',
    'main[role="main"]',
    'main',
  ];

  const MESSAGE_SELECTORS = [
    '[data-testid^="conversation-turn"]',
    '[data-message-author-role]',
    'article[data-message-author-role]',
    'div[data-message-id]',
    'div[data-testid="message"]',
  ];

  function findContainer() {
    for (const sel of CONTAINER_SELECTORS) {
      const node = document.querySelector(sel);
      if (node) return node;
    }
    return document.querySelector('main') || document.body;
  }

  function findThreadContainer() {
    return document.getElementsByClassName('thread-xl:pt-header-height')[0] || null;
  }

  function isOnChatPage() {
    return !!document.querySelector('textarea, [data-testid="composer"], [data-testid="send-button"]');
  }

  function collectMessages() {
    const nodes = new Set();
    MESSAGE_SELECTORS.forEach((sel) => {
      document.querySelectorAll(sel).forEach((n) => nodes.add(n));
    });
    let arr = [...nodes].filter((n) => !container || container.contains(n));
    // Remove nested duplicates
    const set = new Set(arr);
    arr = arr.filter((n) => {
      let p = n.parentElement;
      while (p && p !== container && p !== document.body) {
        if (set.has(p)) return false;
        p = p.parentElement;
      }
      return true;
    });
    arr.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    return arr;
  }

  // ─────────────────────────────────────────────────────────────────
  // Strategy: Hide vs Delete
  // ─────────────────────────────────────────────────────────────────
  const strategies = {
    hide: {
      apply(messages, firstVisible) {
        messages.forEach((node, idx) => {
          node.style.display = idx < firstVisible ? 'none' : '';
        });
      },
      reveal(messages, currentFirst, batchSize) {
        return Math.max(0, currentFirst - batchSize);
      },
      getHiddenCount(firstVisible) {
        return firstVisible;
      },
    },
    delete: {
      apply(messages, firstVisible, buffer) {
        const pruneCount = Math.max(0, firstVisible - buffer);
        for (let i = 0; i < pruneCount; i++) {
          if (messages[i]?.isConnected) {
            messages[i].remove();
            state.prunedCount++;
          }
        }
        for (let i = pruneCount; i < firstVisible; i++) {
          if (messages[i]?.isConnected) messages[i].style.display = 'none';
        }
        for (let i = firstVisible; i < messages.length; i++) {
          if (messages[i]?.isConnected) messages[i].style.display = '';
        }
      },
      reveal(messages, currentFirst, batchSize, buffer) {
        const pruneCount = Math.max(0, currentFirst - buffer);
        if (pruneCount >= currentFirst) return currentFirst;
        return Math.max(pruneCount, currentFirst - batchSize);
      },
      getHiddenCount(firstVisible, buffer) {
        return Math.min(firstVisible, buffer);
      },
    },
  };

  function getStrategy() {
    return settings.deleteMessages ? strategies.delete : strategies.hide;
  }

  // ─────────────────────────────────────────────────────────────────
  // Message Height Limiting
  // ─────────────────────────────────────────────────────────────────
  function applyHeightLimit(node) {
    if (node.dataset.gptBoostHeight) return; // already processed
    if (node.dataset.messageAuthorRole !== 'user') return; // only user messages
    node.dataset.gptBoostHeight = '1';

    // Check if content exceeds threshold
    if (node.scrollHeight > settings.userMessageMaxHeight) {
      node.classList.add('gpt-boost-collapsed');

      node.addEventListener('click', (e) => {
        // Do not toggle if user is selecting text
        if (window.getSelection().toString().length > 0) return;
        // Do not toggle if clicking a link or button
        if (e.target.closest('a, button')) return;

        if (node.classList.contains('gpt-boost-collapsed')) {
          node.classList.remove('gpt-boost-collapsed');
          node.classList.add('gpt-boost-expanded');
        } else {
          node.classList.remove('gpt-boost-expanded');
          node.classList.add('gpt-boost-collapsed');
        }
      });
    }
  }

  function applyHeightLimits(messages) {
    messages.forEach(applyHeightLimit);
  }

  // ─────────────────────────────────────────────────────────────────
  // Placeholder
  // ─────────────────────────────────────────────────────────────────
  function renderPlaceholder(messages, hiddenCount) {
    let el = container?.querySelector('.gpt-boost-hidden-placeholder');
    if (hiddenCount > 0 && !settings.deleteMessages) {
      if (!el) {
        el = document.createElement('div');
        el.className = 'gpt-boost-hidden-placeholder';
        el.addEventListener('click', revealOlder);
      }
      el.textContent =
        hiddenCount === 1
          ? getMessage('hiddenPlaceholderSingular', [String(settings.batchSize)])
          : getMessage('hiddenPlaceholderPlural', [String(hiddenCount), String(settings.batchSize)]);
      const anchor = messages[state.firstVisible];
      if (anchor?.parentNode) {
        anchor.before(el);
      } else if (container) {
        container.appendChild(el);
      }
    } else {
      el?.remove();
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // UI Bar
  // ─────────────────────────────────────────────────────────────────
  function ensureUI() {
    if (!/\/(share|c)\//.test(location.pathname)) {
      uiBar?.remove();
      uiBar = null;
      return;
    }

    if (!uiBar) {
      uiBar = document.createElement('div');
      uiBar.className = 'gpt-boost-bar';
      const pill = document.createElement('div');
      pill.className = 'gpt-boost-pill';
      pill.innerHTML = `
        <span id="gpt-boost-status">${getMessage('statusActive')}</span>
        <button id="gpt-boost-show-older" title="${getMessage('showOlderTitle')}">${getMessage('showOlder')}</button>
        <button id="gpt-boost-collapse" title="${getMessage('collapseTitle')}">${getMessage('collapse')}</button>
        <button id="gpt-boost-reload" title="${getMessage('reloadPageTitle')}" style="display:none;">${getMessage('reloadPage')}</button>
        <span class="gpt-boost-drag-handle" title="${getMessage('dragTitle')}">
          <span class="gpt-boost-drag-dot"></span><span class="gpt-boost-drag-dot"></span><span class="gpt-boost-drag-dot"></span>
          <span class="gpt-boost-drag-dot"></span><span class="gpt-boost-drag-dot"></span><span class="gpt-boost-drag-dot"></span>
        </span>
      `;
      uiBar.appendChild(pill);
      document.body.appendChild(uiBar);

      pill.querySelector('#gpt-boost-show-older').addEventListener('click', revealOlder);
      pill.querySelector('#gpt-boost-collapse').addEventListener('click', collapseToThreshold);
      pill.querySelector('#gpt-boost-reload').addEventListener('click', () => location.reload());
      setupDrag(pill);
    } else if (!uiBar.isConnected) {
      document.body.appendChild(uiBar);
    }

    // Top sentinel for auto-load
    if (threadContainer && !topSentinel && settings.autoloadOnScroll && !settings.deleteMessages) {
      topSentinel = document.createElement('div');
      topSentinel.className = 'gpt-boost-sentinel';
      threadContainer.prepend(topSentinel);
      sentinelObserver = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (e.isIntersecting && state.firstVisible > 0) revealOlder();
        }
      });
      sentinelObserver.observe(topSentinel);
    }
  }

  function setupDrag(pill) {
    const handle = pill.querySelector('.gpt-boost-drag-handle');
    if (!handle || pill.dataset.dragInit) return;
    pill.dataset.dragInit = '1';

    let dragging = false,
      offsetX = 0,
      offsetY = 0;
    const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

    const move = (cx, cy) => {
      const rect = pill.getBoundingClientRect();
      pill.style.left = `${clamp(cx - offsetX, 4, innerWidth - rect.width - 4)}px`;
      pill.style.top = `${clamp(cy - offsetY, 4, innerHeight - rect.height - 4)}px`;
    };

    const onMove = (e) => dragging && (e.preventDefault(), move(e.clientX, e.clientY));
    const onTouchMove = (e) =>
      dragging && e.touches[0] && (e.preventDefault(), move(e.touches[0].clientX, e.touches[0].clientY));
    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', endDrag);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', endDrag);
      handle.classList.remove('dragging');
    };

    const begin = (cx, cy) => {
      const rect = pill.getBoundingClientRect();
      pill.style.transform = 'none';
      pill.style.left = `${rect.left}px`;
      pill.style.top = `${rect.top}px`;
      offsetX = cx - rect.left;
      offsetY = cy - rect.top;
      dragging = true;
      handle.classList.add('dragging');
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', endDrag);
      document.addEventListener('touchmove', onTouchMove, { passive: false });
      document.addEventListener('touchend', endDrag);
    };

    handle.addEventListener('mousedown', (e) => (e.preventDefault(), begin(e.clientX, e.clientY)));
    handle.addEventListener(
      'touchstart',
      (e) => e.touches[0] && (e.preventDefault(), begin(e.touches[0].clientX, e.touches[0].clientY)),
      { passive: false }
    );
  }

  function updateStatus(total, visible) {
    const el = document.getElementById('gpt-boost-status');
    if (!el) return;
    if (settings.deleteMessages) {
      const trueTotal = total + state.prunedCount;
      el.textContent = getMessage('statusBarDeleteMode', [
        String(visible),
        String(settings.hiddenDomBuffer),
        String(trueTotal),
      ]);
    } else {
      el.textContent = getMessage('statusBar', [String(visible), String(total)]);
    }
  }

  function syncUIState() {
    const showBtn = document.getElementById('gpt-boost-show-older');
    const reloadBtn = document.getElementById('gpt-boost-reload');
    if (settings.deleteMessages) {
      if (showBtn) {
        showBtn.disabled = true;
        showBtn.style.opacity = '0.5';
      }
      if (reloadBtn) reloadBtn.style.display = 'block';
    } else {
      if (showBtn) {
        showBtn.disabled = false;
        showBtn.style.opacity = '1';
      }
      if (reloadBtn) reloadBtn.style.display = 'none';
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Core windowing
  // ─────────────────────────────────────────────────────────────────
  function applyWindowing() {
    if (!isOnChatPage()) return;
    container = container?.isConnected ? container : findContainer();
    threadContainer = findThreadContainer();
    ensureUI();

    const messages = collectMessages();
    const total = messages.length;
    if (total === 0) {
      updateStatus(0, 0);
      return;
    }

    const threshold = Math.max(1, settings.maxVisible);
    const buffer = Math.max(0, settings.hiddenDomBuffer);

    // On new chat load (total was 0, now > 0), reset
    if (state.lastTotal === 0 && total > 0) {
      state.firstVisible = Math.max(0, total - threshold);
      state.prunedCount = 0;
    } else if (settings.hideOldestOnNew) {
      state.firstVisible = Math.max(0, total - threshold);
    } else {
      state.firstVisible = Math.min(state.firstVisible, Math.max(0, total - threshold));
    }

    state.lastTotal = total;
    const strategy = getStrategy();

    if (settings.deleteMessages) {
      strategy.apply(messages, state.firstVisible, buffer);
    } else {
      strategy.apply(messages, state.firstVisible);
    }

    const visible = total - state.firstVisible;
    updateStatus(total, visible);

    const hiddenCount = strategy.getHiddenCount(state.firstVisible, buffer);
    renderPlaceholder(messages, hiddenCount);

    // Apply height limits to visible messages
    applyHeightLimits(messages);

    log('applyWindowing:', { total, firstVisible: state.firstVisible, visible });
  }

  function revealOlder() {
    const messages = collectMessages();
    if (!messages.length || state.firstVisible === 0) return;

    const batchSize = Math.max(1, settings.batchSize);
    const buffer = Math.max(0, settings.hiddenDomBuffer);
    const strategy = getStrategy();

    const newFirst = strategy.reveal(messages, state.firstVisible, batchSize, buffer);
    for (let i = newFirst; i < state.firstVisible; i++) {
      if (messages[i]?.isConnected) messages[i].style.display = '';
    }
    state.firstVisible = newFirst;

    const hiddenCount = strategy.getHiddenCount(state.firstVisible, buffer);
    renderPlaceholder(messages, hiddenCount);
    updateStatus(messages.length, messages.length - state.firstVisible);
    log('revealOlder:', { firstVisible: state.firstVisible });
  }

  function collapseToThreshold() {
    const messages = collectMessages();
    if (!messages.length) return;
    const threshold = Math.max(1, settings.maxVisible);
    state.firstVisible = Math.max(0, messages.length - threshold);
    applyWindowing();
    container?.scrollTo?.({ top: container.scrollHeight, behavior: 'smooth' });
  }

  // ─────────────────────────────────────────────────────────────────
  // Scheduling & Observation
  // ─────────────────────────────────────────────────────────────────
  let scheduled = false;
  function scheduleApply(reason) {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      log('scheduleApply:', reason);
      applyWindowing();
    });
  }

  function setupObserver() {
    mainObserver?.disconnect();
    mainObserver = new MutationObserver(() => {
      if (!container?.isConnected) container = findContainer();
      if (uiBar && !uiBar.isConnected) document.body.appendChild(uiBar);
      scheduleApply('dom mutation');
    });
    mainObserver.observe(document.body, { childList: true, subtree: true });
    log('setupObserver: attached');
  }

  let lastPath = '';
  function handleRouteChange() {
    const path = location.pathname + location.search;
    if (path === lastPath) return;
    lastPath = path;
    state.firstVisible = 0;
    state.prunedCount = 0;
    state.lastTotal = 0;
    sentinelObserver?.disconnect();
    sentinelObserver = null;
    topSentinel?.remove();
    topSentinel = null;
    scheduleApply('route change');
  }

  // ─────────────────────────────────────────────────────────────────
  // Init
  // ─────────────────────────────────────────────────────────────────
  async function init() {
    await loadSettings();
    watchSettings();
    setupObserver();
    handleRouteChange();
    scheduleApply('init');

    // SPA navigation
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    history.pushState = function () {
      origPush.apply(this, arguments);
      handleRouteChange();
    };
    history.replaceState = function () {
      origReplace.apply(this, arguments);
      handleRouteChange();
    };
    window.addEventListener('popstate', handleRouteChange);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
