# Rollout & Risk Management Plan

## Strategy
- Deliver in small PRs:
  1) Options toggle + i18n + UI (no functional deletion yet)
  2) Enable deletion branch with feature flag
  3) Polish and README update

## Risk Matrix
- UX surprise: Show Older disabled → Mitigation: clear badge + Reload button + release notes
- DOM churn/observer loops → Mitigation: rAF batching and deletion only at top cut
- Selector drift from ChatGPT DOM → Mitigation: conservative multi-selectors and containment checks

## Rollback
- If issues observed, turn `deleteMessages` off by default (already default)
- Revert PR 2 quickly; PR 1 leaves only UI/flag with no behavior change

## Communication
- PR description includes motivation, screenshots, and test notes
- Document trade-offs in README Configure section
