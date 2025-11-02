# Manual Testing Plan for DOM Pruning

## Scenarios
1. Default (hide) mode parity
   - Ensure reveal/collapse works as before
   - Placeholder shows correct hidden counts
   - Autoload-on-scroll reveals on reaching top

2. Delete mode enabled
   - Oldest messages beyond threshold are removed
   - DOM node count remains bounded by `maxVisible`
   - "Show older" button disabled/hidden
   - "Reload page" button present and reloads the conversation
   - Status pill shows delete mode badge

3. Navigation & SPA behavior
   - Route changes (/c/*, /share/*) keep observers functional
   - UI pill persists; no duplicates

4. Robustness
   - Fast incoming messages do not cause flicker or errors
   - No console errors; no infinite observer loops

## Suggested steps
- Set maxVisible=10, batchSize=10
- Post > 50 alternating user/assistant messages
- Toggle delete mode ON and continue posting; observe DOM size and responsiveness
- Try reload and confirm full history is restored
