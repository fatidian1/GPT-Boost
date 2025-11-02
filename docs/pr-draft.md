# PR Draft: DOM Pruning (Physical Deletion) Feature Flag

## Title
feat: Add optional DOM pruning for older messages to reduce lag on long conversations

## Summary
This PR adds an opt-in mode that physically deletes old message nodes beyond the configured threshold. It keeps the DOM small and responsive while preserving the current default behavior (hide-only).

## Details
- Adds `deleteMessages` option in the Options page
- In delete mode:
  - Windowing removes old nodes (`node.remove()`)
  - Disables Show Older; adds a Reload Page button
  - Disables autoload-on-scroll sentinel
  - Status pill shows a small badge

## Why
Long ChatGPT threads accumulate thousands of nodes, slowing layout/paint and increasing memory. Pruning reduces DOM size materially.

## Screenshots (placeholder)
- Options page with new checkbox
- Status pill with badge and Reload button

## Testing
See docs/testing.md and docs/perf-measurement-plan.md

## Backward compatibility
- Default behavior unchanged (flag-off)
- No manifest/API changes

## Risks
- Users might expect Show Older to work in delete mode → clear UI and doc
- DOM selector drift → multi-selector and containment filter already in place

## Follow-ups
- Localize new strings for non-English locales
- Minor styling for disabled button
