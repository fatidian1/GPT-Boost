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
  - ON: physically remove old message nodes from the DOM

- `hiddenDomBuffer` (default: `0`)
  - The number of oldest messages to keep in the DOM but hidden (a buffer behind the visible window)
  - When `deleteMessages=true`, messages older than `(maxVisible + hiddenDomBuffer)` are pruned (deleted)

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
  - Two-tier windowing:
    - Keep latest `maxVisible` messages visible
    - Keep up to `hiddenDomBuffer` older messages in the DOM but hidden (eligible for "Show older")
    - Prune any remaining older messages (physically delete)
  - "Show older" continues to work while hidden buffer exists; once exhausted, older pruned history requires reload
  - "Collapse" still works (recomputes the threshold and trims DOM accordingly)
  - Status text indicates delete mode is active (e.g., `deleteModeActive`) and can optionally display pruned count
  - A dedicated "Reload page" button reloads the conversation to restore full history from the server

## 5) Algorithm Adjustments

- Windowing (`applyWindowing()`):
  - Compute the desired hidden count as today (based on `maxVisible`, `hideOldestOnNew`, and `visibleLimit`). Let this be `hiddenDesired`.
  - If `deleteMessages=false`: keep current behavior (toggle `display` for the first `hiddenDesired` nodes).
  - If `deleteMessages=true` with buffer `B = hiddenDomBuffer`:
    - Compute how many to prune (delete) from the top: `pruneCount = max(0, hiddenDesired - B)`
    - Physically delete the first `pruneCount` nodes
    - The remaining hidden count becomes `hiddenBuffered = hiddenDesired - pruneCount` (guaranteed `<= B`)
    - Apply `display:none` to the first `hiddenBuffered` nodes; clear display for the rest (visible)
    - Track `prunedTopCount += pruneCount` for status/telemetry

- Reveal (`revealOlder()`):
  - If `deleteMessages=false`: unchanged (reveal from hidden pool)
  - If `deleteMessages=true`: reveal from the hidden buffer while `hiddenBuffered > 0`; once buffer is exhausted, show a hint (or simply do nothing) since older messages were pruned. Users can use Reload to get full history

- Auto-reveal on scroll (IntersectionObserver):
  - If `deleteMessages=true`: keep auto-reveal enabled only while hidden buffer exists; safe fallback is to guard with `!settings.deleteMessages` to avoid surprises

- Collapse (`collapseToThreshold()`):
  - Works in both modes. In delete mode, remove the oldest nodes until only threshold remain, then scroll to bottom.

## 6) UI/UX Changes

- Pill buttons:
  - Keep "Collapse" unchanged
  - In delete mode, keep "Show older" active as long as there is hidden buffer; disable when buffer is empty; add a new "Reload page" button
  - Status text shows visible/total plus a delete-mode badge (optionally append pruned count)

- Options page:
  - Add checkbox for `deleteMessages` with a clear warning: irreversible during the current session; use reload to restore full history.

## 7) Data Model & Internal State

- Existing: `hiddenCountTop`, `visibleLimit`, `lastApply`, `currentStatus`.
- New:
  - `prunedTopCount` (number): cumulative count of deleted (pruned) messages at the top since page load
  - `hiddenDomBuffer` (number, from settings): buffer size for retained hidden DOM

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

- PR 1: Settings toggle + i18n + UI changes (deleteMessages + hiddenDomBuffer, Reload button, status badge). Deletion logic still disabled.
- PR 2: Implement two-stage windowing (deletion + hidden buffer) in the algorithm, and introduce reveal/autoload branching.
- PR 3: Final touches (display pruned count in status, update README, minor CSS).

## 11) Acceptance Criteria

- Delete mode keeps DOM messages ≤ Max visible at steady state.
- No console errors in normal use.
- In hide mode (default), behavior is unchanged.
- Users can restore full history within one click (Reload page) in delete mode.

## 12) Code-level edits by file (concrete)

This section describes exact edits aligned with the current codebase to avoid ambiguity.

### A) `src/content.js`

1) Extend defaults and state

- Add to `DEFAULTS`: `deleteMessages: false`, `hiddenDomBuffer: 0`
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
- If `!settings.deleteMessages`: keep current style-based hiding logic
- Else (delete mode with buffer):
  - Compute `pruneCount = max(0, hiddenDesired - settings.hiddenDomBuffer)`
  - Remove first `pruneCount` nodes; `prunedTopCount += pruneCount`
  - Hide the next `hiddenBuffered = hiddenDesired - pruneCount` nodes (`display:none`)
  - Clear display for the rest (visible)

5) Status badge (optional)

- When `settings.deleteMessages === true`, append ` — ${getMessage('deleteModeActive')}` to the status element’s text after setting counts.

6) Reveal (`revealOlder()`)

- Early return when `settings.deleteMessages === true` (no-op). Reload is handled by the new button.

7) Autoload on scroll

- Guard the `IntersectionObserver` with `!settings.deleteMessages`.

### B) `src/options.html`

Insert below the existing checkboxes:
```html
<label class="row">
  <input type="checkbox" id="deleteMessages" />
  <span id="labelDeleteMode"></span>
</label>

<label>
  <span id="labelHiddenBuffer"></span>
  <input type="number" id="hiddenDomBuffer" min="0" step="1" />
  <small id="defaultHiddenBuffer"></small>
</label>
```
### C) `src/options.js`

1) Extend defaults:

```javascript
const DEFAULTS = {
  maxVisible: 10,
  batchSize: 10,
  autoloadOnScroll: true,
  hideOldestOnNew: true,
  deleteMessages: false,
  hiddenDomBuffer: 0,
};
```

2) Localize labels:
```javascript
const lblDeleteMode = document.getElementById('labelDeleteMode');
if (lblDeleteMode) lblDeleteMode.textContent = getMessage('labelDeleteMode');
const lblHiddenBuffer = document.getElementById('labelHiddenBuffer');
if (lblHiddenBuffer) lblHiddenBuffer.textContent = getMessage('labelHiddenBuffer');
const defHidden = document.getElementById('defaultHiddenBuffer');
if (defHidden) defHidden.textContent = getMessage('defaultNumber', ['0']);
```

3) Load persisted values:

```javascript
document.getElementById('deleteMessages').checked = !!res.deleteMessages;
document.getElementById('hiddenDomBuffer').value = String(Math.max(0, res.hiddenDomBuffer || 0));
```
4) Save on submit:

```javascript
const deleteMessages = !!document.getElementById('deleteMessages').checked;
const hiddenDomBuffer = Math.max(0, parseInt(document.getElementById('hiddenDomBuffer').value || '0', 10));
chrome.storage.sync.set({ maxVisible, batchSize, autoloadOnScroll, hideOldestOnNew, deleteMessages, hiddenDomBuffer });
```
### D) `assets/locales/*/messages.json`

Add (at minimum in `en`):

- `"labelDeleteMode": { "message": "Physically delete old messages (irreversible until page reload)" }`
- `"labelHiddenBuffer": { "message": "Keep hidden DOM messages (buffer)" }`
- `"deleteModeActive": { "message": "Memory-optimized: old messages are deleted" }`
- `"reloadPage": { "message": "Reload page" }`
- `"reloadPageTitle": { "message": "Reload conversation to restore full history" }`

Optional (if a cut-point notice is preserved in delete mode):

- `"prunedPlaceholderSingular": { "message": "1 older message pruned — click to reload page" }`
- `"prunedPlaceholderPlural": { "message": "$1 older messages pruned — click to reload page" }`

### E) `README.md`

Add under Configure:

- Physically delete old messages (optional). When enabled, the extension removes old message DOM nodes to keep the conversation light. "Show older" is disabled in this mode; use the new "Reload page" button to restore full history from the server.

### F) QA checklist

- Hide mode parity retained (reveal/collapse/placeholder work as before).
- Delete mode bounded DOM size ≤ Max visible; Show Older disabled; Reload button visible; status shows badge.
- SPA route changes handled; observers reattach as needed.
- No console errors; no observer thrashing.
