# Pull Request: DOM Pruning (Physical Deletion) feature flag

## Summary
- Introduces an optional setting to physically delete old message DOM nodes to reduce memory and rendering overhead on long conversations.
- Default behavior remains unchanged (hiding via CSS); deletion is opt-in via Options.

## Motivation and Context
- Long ChatGPT threads accumulate thousands of DOM nodes causing lag and memory growth.
- Deleting out-of-window nodes keeps the DOM small and responsive, improving UX.

## Feature Flag
- `deleteMessages` (default: false)
- When enabled: oldest messages beyond the threshold are removed (`node.remove()`)
- "Show older" becomes disabled; a "Reload page" action allows restoring full history from the server.

## Implementation Notes
- Windowing logic branches on `settings.deleteMessages`.
- IntersectionObserver-based auto-reveal is disabled in delete mode.
- Status bar shows a small badge indicating delete mode is active.
- Options UI adds a checkbox; setting changes apply live via chrome.storage listeners.

## Screenshots / Demos
- Before/After (hide vs delete mode)
- Status pill with delete mode badge
- Options page with new checkbox

## Backward Compatibility
- Default behavior unchanged (hiding only)
- No API or manifest changes

## Risks and Mitigations
- Users expect "Show older" to work → Disabled only in delete mode; clear Reload affordance and status badge
- Layout jumps when deleting → Performed within rAF; only oldest nodes are removed
- ChatGPT DOM changes → Selector set is resilient; observe+reapply handles SPA swaps

## Testing
- Manual test plan in docs/testing.md
- Performance plan in docs/perf-measurement-plan.md

## Checklist
- [ ] Feature flag guarded and default-off
- [ ] Options toggle implemented and localized
- [ ] Windowing: delete branch implemented and placeholder behavior adjusted
- [ ] UI: Show Older disabled; Reload button present in delete mode
- [ ] Status badge added in delete mode
- [ ] No console errors in normal flows
- [ ] README updated (Configure section)
- [ ] locales updated (en at minimum)

## Linked Issues
- N/A (fork feature)

