# GPT-Boost: DOM Pruning (Physical Deletion) Implementation Plan

Last updated: 2025-11-03
Owner: tsuchim

Scope: Convert the current "hide old messages" strategy into an optional "physically delete old messages" mode to further reduce DOM size, memory usage, and layout/reflow cost on long conversations.

## 1) Goals and Non-Goals

- Goals
  - Reduce memory and rendering overhead by permanently removing old message nodes from the DOM.
  - Keep a smooth chat experience with small, predictable DOM size (bounded by Max visible messages).
  - Provide a clear UX path to get the full history back (page reload) when pruning is enabled.
  - Preserve current behavior by default (opt-in via a setting).

- Non-Goals
  - No attempt to reconstruct deleted DOM from in-memory caches.
  - No direct ChatGPT API calls; rely on the page’s own reload to restore full history.

## 2) Current Architecture (as of src/content.js)

- Message discovery: `collectMessages()` aggregates message nodes using multiple selectors and sorts them in document order.
- Windowing: `applyWindowing()` hides the oldest messages beyond the threshold by setting `node.style.display = 'none'` and keeps latest N visible.
- Reveal: `revealOlder()` reduces `hiddenCountTop` by `batchSize` and clears `display` for those nodes.
- Collapse: `collapseToThreshold()` resets visibility to the threshold, then scrolls to bottom.
- Observers: MutationObservers re-run windowing when conversation content changes or SPA navigation occurs. An IntersectionObserver auto-reveals older messages when reaching the top (optional).
- UI: A floating pill contains status text, "Show older" and "Collapse" buttons, plus a cut-point placeholder in the DOM that shows remaining hidden count and can be clicked to reveal.

## 3) Feature Flag & Settings (new)

Add a new boolean setting in storage and Options UI:

- `deleteMessages` (default: `false`)
  - OFF (default): current behavior (hide using CSS display:none)
  - ON: physically remove old message nodes from the DOM to keep only the most recent N nodes

Strings to add (i18n):

- `labelDeleteMode`: "Physically delete old messages (irreversible until page reload)"
- `deleteModeActive`: "Memory-optimized: old messages are deleted"
- `reloadPage`: "Reload page"
- `reloadPageTitle`: "Reload conversation to restore full history"

Optional (if we keep a cut-point notice in delete mode):

- `prunedPlaceholderSingular`: "1 older message pruned — click to reload page"
- `prunedPlaceholderPlural`: "$1 older messages pruned — click to reload page"

## 4) Behavioral Changes by Mode

- Hide mode (current, default):
  - "Show older" reveals hidden batches.
  - Cut-point placeholder shows remaining hidden count and reveals on click.

- Delete mode (new):
  - Oldest messages beyond the threshold are removed via `node.remove()`.
  - "Show older" is disabled or hidden (no nodes to reveal).
  - "Collapse" still works (recomputes the threshold and trims DOM accordingly).
  - Status text indicates delete mode is active (e.g., `deleteModeActive`).
  - A dedicated "Reload page" button reloads the conversation to restore full history from the server.

## 5) Algorithm Adjustments

- Windowing (`applyWindowing()`):
  - Compute `hiddenCountTop` the same way to define the cut-point index `k`.
  - If `deleteMessages=false`: keep current behavior (toggle `display`).
  - If `deleteMessages=true`:
    - For indices `< k`, remove nodes: `node.remove()` and increment `prunedTopCount`.
    - For indices `>= k`, ensure `node.style.display = ''`.
    - Update status using the new visible total (either `totalBefore - k` or a fresh `collectMessages()` count).
    - Skip the hidden placeholder in delete mode (no hidden nodes remain).

- Reveal (`revealOlder()`):
  - If `deleteMessages=true`: no-op (rely on the new Reload button).

- Auto-reveal on scroll (IntersectionObserver):
  - If `deleteMessages=true`: do not attach the top sentinel (disable auto-reveal).

- Collapse (`collapseToThreshold()`):
  - Works in both modes. In delete mode, remove the oldest nodes until only threshold remain, then scroll to bottom.

## 6) UI/UX Changes

- Pill buttons:
  - Keep "Collapse" unchanged.
  - In delete mode, hide or disable "Show older"; add a new "Reload page" button (`window.location.reload()`).
  - Status text shows visible/total plus a delete-mode badge, e.g., "GPT Boost · visible 10/10 — Memory-optimized".

- Options page:
  - Add checkbox for `deleteMessages` with a clear warning: irreversible during the current session; use reload to restore full history.

## 7) Data Model & Internal State

- Existing: `hiddenCountTop`, `visibleLimit`, `lastApply`, `currentStatus`.
- New: `prunedTopCount` (number) — cumulative count of deleted (pruned) messages at the top since page load.

Notes:

- `currentStatus.total` should represent current DOM messages; we may append a badge `(memory-optimized)` via i18n.
- `sawZeroThenGrew` logic remains applicable to detect fresh loads and apply initial trimming.

## 8) Edge Cases & Error Modes

- Empty thread / loading → do nothing until messages appear.
- SPA container replacement → observers already reattach; re-apply windowing.
- Extremely fast message bursts → rely on rAF batching; still bounded by threshold.
- Scroll position after collapse → use existing `scrollTo` behavior; optionally switch to `scrollIntoView` for the first visible node if needed.
- The page’s own scripts may recycle the DOM → our observers handle re-apply; deletion is idempotent.

## 9) Testing Plan (Manual)

1. Long conversation (> 200 messages) on chatgpt.com.
2. Verify default (hide) mode still behaves identically: reveal, collapse, autoload on scroll.
3. Enable delete mode in options:
   - Confirm DOM node count remains <= threshold as new messages arrive.
   - Confirm performance improvement (subjective OK): smoother scroll, lower input latency.
   - Confirm "Show older" is disabled/hidden; Reload button is visible.
   - Reload page → full history visible again.
4. Navigate across /c/* and /share/* routes; confirm observers keep working.
5. Toggle setting live; confirm changes apply without refresh (as with other settings).

## 10) Incremental Delivery

- PR 1: Settings toggle + i18n + UI changes (button states) with the feature flag wired, still using hide mode.
- PR 2: Switch algorithm to physical deletion when the flag is ON; add `prunedTopCount` and the Reload affordance.
- PR 3: Polish (status text badge, minor CSS) and README update.

## 11) Acceptance Criteria

- Delete mode keeps DOM messages ≤ Max visible at steady state.
- No console errors in normal use.
- In hide mode (default), behavior is unchanged.
- Users can restore full history within one click (Reload page) in delete mode.

## 12) Code-level edits by file (concrete)

This section describes exact edits aligned with the current codebase to avoid ambiguity.

### A) `src/content.js`

1) Extend defaults and state

- Add to `DEFAULTS`: `deleteMessages: false`
- Add module state: `let prunedTopCount = 0;`

2) Settings plumbing

- `loadSettings()` already uses `chrome.storage.sync.get(DEFAULTS, ...)` → the new key will load automatically.
- `watchSettings()` iterates `Object.keys(DEFAULTS)` → the new key will update live automatically.

3) UI creation (`ensureUI()`)

- Only create the top sentinel/IntersectionObserver when `settings.autoloadOnScroll && !settings.deleteMessages`.
- After creating the pill, add a conditional Reload button when delete mode is on:
  - HTML: `<button id="gpt-boost-reload" title="${getMessage('reloadPageTitle')}">${getMessage('reloadPage')}</button>`
  - Handler: `document.getElementById('gpt-boost-reload')?.addEventListener('click', () => window.location.reload());`
- Disable or hide "Show older" when delete mode is on:
  - Example: `btn.disabled = true; btn.classList.add('disabled');`

4) Windowing (`applyWindowing()`)

- Compute `threshold`, `batchSize`, and `hiddenCountTop` as today.
- Let `totalBefore = messages.length`.
- If `!settings.deleteMessages`: keep current style-based hiding logic.
- Else (delete mode):
  - For indices `< hiddenCountTop`: `node.remove()`; increment `prunedTopCount`.
  - For indices `>= hiddenCountTop`: ensure `node.style.display = ''`.
  - Determine visible totals as `visibleTotal = totalBefore - hiddenCountTop` (or `collectMessages().length`).
  - Call `updateStatus(visibleTotal, visibleTotal)`.
  - Skip creating the hidden placeholder in delete mode.

5) Status badge (optional)

- When `settings.deleteMessages === true`, append ` — ${getMessage('deleteModeActive')}` to the status element’s text after setting counts.

6) Reveal (`revealOlder()`)

- Early return when `settings.deleteMessages === true` (no-op). Reload is handled by the new button.

7) Autoload on scroll

- Guard the `IntersectionObserver` with `!settings.deleteMessages`.

### B) `src/options.html`

Insert below the existing checkboxes:

<label class="row">
  <input type="checkbox" id="deleteMessages" />
  <span id="labelDeleteMode"></span>
</label>

### C) `src/options.js`

1) Extend defaults:

const DEFAULTS = {
  maxVisible: 10,
  batchSize: 10,
  autoloadOnScroll: true,
  hideOldestOnNew: true,
  deleteMessages: false,
};

2) Localize label:

const lblDeleteMode = document.getElementById('labelDeleteMode');
if (lblDeleteMode) lblDeleteMode.textContent = getMessage('labelDeleteMode');

3) Load persisted value:

document.getElementById('deleteMessages').checked = !!res.deleteMessages;

4) Save on submit:

const deleteMessages = !!document.getElementById('deleteMessages').checked;
chrome.storage.sync.set({ maxVisible, batchSize, autoloadOnScroll, hideOldestOnNew, deleteMessages });

### D) `assets/locales/*/messages.json`

Add (at minimum in `en`):

- "labelDeleteMode": { "message": "Physically delete old messages (irreversible until page reload)" }
- "deleteModeActive": { "message": "Memory-optimized: old messages are deleted" }
- "reloadPage": { "message": "Reload page" }
- "reloadPageTitle": { "message": "Reload conversation to restore full history" }

Optional (if a cut-point notice is preserved in delete mode):

- "prunedPlaceholderSingular": { "message": "1 older message pruned — click to reload page" }
- "prunedPlaceholderPlural": { "message": "$1 older messages pruned — click to reload page" }

### E) `README.md`

Add under Configure:

- Physically delete old messages (optional). When enabled, the extension removes old message DOM nodes to keep the conversation light. "Show older" is disabled in this mode; use the new "Reload page" button to restore full history from the server.

### F) QA checklist

- Hide mode parity retained (reveal/collapse/placeholder work as before).
- Delete mode bounded DOM size ≤ Max visible; Show Older disabled; Reload button visible; status shows badge.
- SPA route changes handled; observers reattach as needed.
- No console errors; no observer thrashing.
# GPT-Boost: DOM Pruning (Physical Deletion) Implementation Plan# GPT-Boost: DOM Pruning (Physical Deletion) Implementation Plan



Last updated: 2025-11-03Last updated: 2025-11-03

Owner: tsuchimOwner: tsuchim

Scope: Convert the current "hide old messages" strategy into an optional "physically delete old messages" mode to further reduce DOM size, memory usage, and layout/reflow cost on long conversations.Scope: Convert the current "hide old messages" strategy into an optional "physically delete old messages" mode to further reduce DOM size, memory usage, and layout/reflow cost on long conversations.



## 1) Goals and Non-Goals## 1) Goals and Non-Goals



- Goals- Goals

  - Reduce memory and rendering overhead by permanently removing old message nodes from the DOM.  - Reduce memory and rendering overhead by permanently removing old message nodes from the DOM.

  - Keep a smooth chat experience with small, predictable DOM size (bounded by Max visible messages).  - Keep a smooth chat experience with small, predictable DOM size (bounded by Max visible messages).

  - Provide a clear UX path to get the full history back (page reload) when pruning is enabled.  - Provide a clear UX path to get the full history back (page reload) when pruning is enabled.

  - Preserve current behavior by default (opt-in via a setting).  - Preserve current behavior by default (opt-in via a setting).



- Non-Goals- Non-Goals

  - No attempt to reconstruct deleted DOM from in-memory caches.  - No attempt to reconstruct deleted DOM from in-memory caches.

  - No direct ChatGPT API calls; rely on the page's own reload to restore full history.  - No direct ChatGPT API calls; rely on the page’s own reload to restore full history.



## 2) Current Architecture (as of src/content.js)## 2) Current Architecture (as of src/content.js)



- Message discovery: `collectMessages()` aggregates message nodes using multiple selectors and sorts them in document order.- Message discovery: `collectMessages()` aggregates message nodes using multiple selectors and sorts them in document order.

- Windowing: `applyWindowing()` hides the oldest messages beyond the threshold by setting `node.style.display = 'none'` and keeps latest N visible.- Windowing: `applyWindowing()` hides the oldest messages beyond the threshold by setting `node.style.display = 'none'` and keeps latest N visible.

- Reveal: `revealOlder()` reduces `hiddenCountTop` by `batchSize` and clears `display` for those nodes.- Reveal: `revealOlder()` reduces `hiddenCountTop` by `batchSize` and clears `display` for those nodes.

- Collapse: `collapseToThreshold()` resets visibility to the threshold, then scrolls to bottom.- Collapse: `collapseToThreshold()` resets visibility to the threshold, then scrolls to bottom.

- Observers: MutationObservers re-run windowing when conversation content changes or SPA navigation occurs. An IntersectionObserver auto-reveals older messages when reaching the top (optional).- Observers: MutationObservers re-run windowing when conversation content changes or SPA navigation occurs. An IntersectionObserver auto-reveals older messages when reaching the top (optional).

- UI: A floating pill contains status text, "Show older" and "Collapse" buttons, plus a cut-point placeholder in the DOM that shows remaining hidden count and can be clicked to reveal.- UI: A floating pill contains status text, "Show older" and "Collapse" buttons, plus a cut-point placeholder in the DOM that shows remaining hidden count and can be clicked to reveal.



## 3) Proposed Feature Flag & Settings## 3) Proposed Feature Flag & Settings



Add a new boolean setting in storage and Options UI:Add a new boolean setting in storage and Options UI:

- `deleteMessages` (default: `false`)- `deleteMessages` (default: `false`)

  - OFF (default): current behavior (hide using CSS display:none)  - OFF (default): current behavior (hide using CSS display:none)

  - ON: physically remove old message nodes from the DOM to keep only the most recent N nodes  - ON: physically remove old message nodes from the DOM to keep only the most recent N nodes



Strings to add (i18n):Strings to add (i18n):

- `labelDeleteMode`: "Physically delete old messages (irreversible until page reload)"- `labelDeleteMode`: "Physically delete old messages (irreversible until page reload)"

- `deleteModeActive`: "Memory-optimized: old messages are deleted"- `deleteModeActive`: "Memory-optimized: old messages are deleted"

- `reloadPage`: "Reload page"- `reloadPage`: "Reload page"

- `reloadPageTitle`: "Reload conversation to restore full history"- `reloadPageTitle`: "Reload conversation to restore full history"

- `prunedPlaceholderSingular`: "1 older message pruned — click to reload page"- `prunedPlaceholderSingular`: "1 older message pruned — click to reload page"

- `prunedPlaceholderPlural`: "$1 older messages pruned — click to reload page"- `prunedPlaceholderPlural`: "$1 older messages pruned — click to reload page"



## 4) Behavioral Changes by Mode## 4) Behavioral Changes by Mode



- Hide mode (current, default):- Hide mode (current, default):

  - "Show older" reveals hidden batches.  - "Show older" reveals hidden batches.

  - Cut-point placeholder shows remaining hidden count and reveals on click.  - Cut-point placeholder shows remaining hidden count and reveals on click.



- Delete mode (new):- Delete mode (new):

  - Oldest messages beyond the threshold are removed via `node.remove()`.  - Oldest messages beyond the threshold are removed via `node.remove()`.

  - "Show older" is disabled or hidden (no nodes to reveal).  - "Show older" is disabled or hidden (no nodes to reveal).

  - "Collapse" still works (recomputes the threshold and trims DOM accordingly).  - "Collapse" still works (recomputes the threshold and trims DOM accordingly).

  - Status text indicates delete mode is active (e.g., `deleteModeActive`).  - Status text indicates delete mode is active (e.g., `deleteModeActive`).

  - Cut-point placeholder is repurposed to indicate how many messages were pruned and clicking it triggers `window.location.reload()`.  - Cut-point placeholder is repurposed to indicate how many messages were pruned and clicking it triggers `window.location.reload()`.

  - Optional: Also add a dedicated "Reload page" button in the pill for clarity.  - Optional: Also add a dedicated "Reload page" button in the pill for clarity.



## 5) Algorithm Adjustments## 5) Algorithm Adjustments



- Windowing (`applyWindowing()`):- Windowing (`applyWindowing()`):

  - Compute `hiddenCountTop` the same way to define the cut-point index `k`.  - Compute `hiddenCountTop` the same way to define the cut-point index `k`.

  - If `deleteMessages=false`: keep current behavior (toggle `display`).  - If `deleteMessages=false`: keep current behavior (toggle `display`).

  - If `deleteMessages=true`:  - If `deleteMessages=true`:

    - For indices `< k`, remove nodes: `node.remove()`.    - For indices `< k`, remove nodes: `node.remove()`.

    - Do not attempt to set `display` on removed nodes.    - Do not attempt to set `display` on removed nodes.

    - Track a separate counter `prunedTopCount` (cumulative deletes this session) used for placeholder/status messaging.    - Track a separate counter `prunedTopCount` (cumulative deletes this session) used for placeholder/status messaging.

    - Ensure `lastApply` comparison accounts for total changing due to deletions.    - Ensure `lastApply` comparison accounts for total changing due to deletions.



- Reveal (`revealOlder()`):- Reveal (`revealOlder()`):

  - If `deleteMessages=true`: no-op or trigger reload.  - If `deleteMessages=true`: no-op or trigger reload.

  - Preferred: Update placeholder to invite page reload and do nothing else.  - Preferred: Update placeholder to invite page reload and do nothing else.



- Auto-reveal on scroll (IntersectionObserver):- Auto-reveal on scroll (IntersectionObserver):

  - If `deleteMessages=true`: disable auto-reveal behavior; optionally prompt reload when reaching top.  - If `deleteMessages=true`: disable auto-reveal behavior; optionally prompt reload when reaching top.



- Collapse (`collapseToThreshold()`):- Collapse (`collapseToThreshold()`):

  - Works in both modes. In delete mode, remove the oldest nodes until only threshold remain, then scroll to bottom.  - Works in both modes. In delete mode, remove the oldest nodes until only threshold remain, then scroll to bottom.



## 6) UI/UX Changes## 6) UI/UX Changes



- Pill buttons:- Pill buttons:

  - Keep "Collapse" unchanged.  - Keep "Collapse" unchanged.

  - In delete mode, hide or disable "Show older"; add a new "Reload page" button (`window.location.reload()`).  - In delete mode, hide or disable "Show older"; add a new "Reload page" button (`window.location.reload()`).

  - Status text shows visible/total plus a delete-mode badge, e.g., "GPT Boost · visible 10/10 — Memory-optimized".  - Status text shows visible/total plus a delete-mode badge, e.g., "GPT Boost · visible 10/10 — Memory-optimized".



- Placeholder at cut-point:- Placeholder at cut-point:

  - Hide mode: unchanged (click to reveal).  - Hide mode: unchanged (click to reveal).

  - Delete mode: text changes to `prunedPlaceholder*` and click → reload.  - Delete mode: text changes to `prunedPlaceholder*` and click → reload.



- Options page:- Options page:

  - Add checkbox for `deleteMessages` with a clear warning: irreversible during the current session; use reload to restore full history.  - Add checkbox for `deleteMessages` with a clear warning: irreversible during the current session; use reload to restore full history.



## 7) Data Model & Internal State## 7) Data Model & Internal State



- Existing:- Existing:

  - `hiddenCountTop`, `visibleLimit`, `lastApply`, `currentStatus`.  - `hiddenCountTop`, `visibleLimit`, `lastApply`, `currentStatus`.

- New:- New:

  - `prunedTopCount` (number): cumulative count of deleted (pruned) messages at the top since page load.  - `prunedTopCount` (number): cumulative count of deleted (pruned) messages at the top since page load.



Notes:Notes:

- `currentStatus.total` should represent current DOM messages; we can optionally display `(pruned N)` as supplemental info in status.- `currentStatus.total` should represent current DOM messages; we can optionally display `(pruned N)` as supplemental info in status.

- `sawZeroThenGrew` logic remains applicable to detect fresh loads and apply initial trimming.- `sawZeroThenGrew` logic remains applicable to detect fresh loads and apply initial trimming.



## 8) Edge Cases & Error Modes## 8) Edge Cases & Error Modes



- Empty thread / loading → do nothing until messages appear.- Empty thread / loading → do nothing until messages appear.

- SPA container replacement → observers already reattach; re-apply windowing.- SPA container replacement → observers already reattach; re-apply windowing.

- Extremely fast message bursts → rely on rAF batching; still bounded by threshold.- Extremely fast message bursts → rely on rAF batching; still bounded by threshold.

- Scroll position after collapse → use existing `scrollTo` behavior; optionally switch to `scrollIntoView` for the first visible node if needed.- Scroll position after collapse → use existing `scrollTo` behavior; optionally switch to `scrollIntoView` for the first visible node if needed.

- The page's own scripts may recycle the DOM → our observers handle re-apply; deletion is idempotent.- The page’s own scripts may recycle the DOM → our observers handle re-apply; deletion is idempotent.



## 9) Testing Plan (Manual)## 9) Testing Plan (Manual)



1. Long conversation (> 200 messages) on chatgpt.com.1. Long conversation (> 200 messages) on chatgpt.com.

2. Verify default (hide) mode still behaves identically: reveal, collapse, autoload on scroll.2. Verify default (hide) mode still behaves identically: reveal, collapse, autoload on scroll.

3. Enable delete mode in options:3. Enable delete mode in options:

   - Confirm DOM node count remains <= threshold as new messages arrive.   - Confirm DOM node count remains <= threshold as new messages arrive.

   - Confirm performance improvement: faster scroll, input latency reduced (subjective OK).   - Confirm performance improvement: faster scroll, input latency reduced (subjective OK).

   - Confirm "Show older" is disabled/hidden; placeholder invites reload.   - Confirm "Show older" is disabled/hidden; placeholder invites reload.

   - Click placeholder → page reloads; full history visible again.   - Click placeholder → page reloads; full history visible again.

4. Navigate across /c/* and /share/* routes; confirm observers keep working.4. Navigate across /c/* and /share/* routes; confirm observers keep working.

5. Toggle setting live; confirm changes apply without refresh (as with other settings).5. Toggle setting live; confirm changes apply without refresh (as with other settings).



## 10) Incremental Delivery## 10) Incremental Delivery



- PR 1: Settings toggle + i18n + UI changes (button states, placeholder text) with feature flag wired, but still hiding.- PR 1: Settings toggle + i18n + UI changes (button states, placeholder text) with feature flag wired, but still hiding.

- PR 2: Switch algorithm to physical deletion when flag is ON; add `prunedTopCount` and reload affordances.- PR 2: Switch algorithm to physical deletion when flag is ON; add `prunedTopCount` and reload affordances.

- PR 3: Polish (status text badge, minor CSS) and README update.- PR 3: Polish (status text badge, minor CSS) and README update.



## 11) Risks & Mitigations## 11) Risks & Mitigations



- Users expect "Show older" to work → Disable only in delete mode, provide clear reload path and warning text.- Users expect "Show older" to work → Disable only in delete mode, provide clear reload path and warning text.

- Potential layout jumps when deleting → Remove in batches inside rAF (already the case), minimize synchronous work.- Potential layout jumps when deleting → Remove in batches inside rAF (already the case), minimize synchronous work.

- ChatGPT DOM changes → Our selector set is already resilient and uses containment filtering; continue to monitor.- ChatGPT DOM changes → Our selector set is already resilient and uses containment filtering; continue to monitor.



## 12) Acceptance Criteria## 12) Acceptance Criteria



- Delete mode keeps DOM messages ≤ Max visible at steady state.- Delete mode keeps DOM messages ≤ Max visible at steady state.

- No console errors in normal use.- No console errors in normal use.

- In hide mode (default), behavior is unchanged.- In hide mode (default), behavior is unchanged.

- Users can restore full history within one click (Reload page) in delete mode.- Users can restore full history within one click (Reload page) in delete mode.



## 13) File Changes (planned)## 13) File Changes (planned)



- `src/content.js`: feature flag, deletion branch in windowing, UI conditional, placeholder behavior, `prunedTopCount`.- `src/content.js`: feature flag, deletion branch in windowing, UI conditional, placeholder behavior, `prunedTopCount`.

- `src/options.html`: checkbox for delete mode.- `src/options.html`: checkbox for delete mode.

- `src/options.js`: persist `deleteMessages` via `chrome.storage.sync`.- `src/options.js`: persist `deleteMessages` via `chrome.storage.sync`.

- `assets/locales/*/messages.json`: new i18n strings.- `assets/locales/*/messages.json`: new i18n strings.

- `src/scss/content.scss` (optional): styles for disabled button/badge.- `src/scss/content.scss` (optional): styles for disabled button/badge.

- `README.md`: document the new option and trade-offs.- `README.md`: document the new option and trade-offs.

