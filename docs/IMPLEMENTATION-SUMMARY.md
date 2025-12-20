# DOM Pruning Implementation Summary

**Implementation Date**: 2025-11-03  
**Status**: Published

## Overview

Implemented a feature to physically delete old messages to reduce memory usage. This is an opt-in setting, ensuring no impact on existing users.

## Added Features

### 1. Delete Mode
- Enabled via `deleteMessages` setting.
- When active: Physically deletes messages exceeding the `hiddenDomBuffer`.
- Page reload restores full history.

### 2. Hidden Buffer
- Adjustable via `hiddenDomBuffer` setting.
- Number of hidden messages to keep in the DOM before deletion.
- Messages can be restored using "Show Older".

### 3. UI/Options Extension
- Added Delete Mode checkbox to the Options screen.
- Added Hidden Buffer numeric input field.
- Only displayed when Delete Mode is enabled.

### 4. i18n Support
- New i18n keys: `labelDeleteMode`, `labelHiddenBuffer`, `deleteModeActive`, `reloadPage`.
- All 19 locales supported.

## Technical Details

### File Changes

| File | Change Details |
|---------|--------|
| `src/content.js` | Three-layer windowing (Delete/Hide/Show) |
| `src/options.js` | Delete Mode / Hidden Buffer UI |
| `src/options.html` | Added new fields |
| `src/manifest.json` | ver 1.2.0 |
| `assets/locales/*` | Added new i18n keys |
| `package.json` | ver 1.2.0 |

### Lines of Code (LOC)
- JS additions: approx. 49 lines (mainly in `content.js`)
- i18n additions: multiple locales updated simultaneously
- Build: Success confirmed

## Security Verification
- ✅ Manifest Permissions: "storage" only (no external access)
- ✅ External Communication: None detected (no fetch/XHR/WebSocket)
- ✅ Obfuscation/eval: None detected
- ✅ Code Conventions: Compliant with Prettier / ESLint

## How to Submit PR

**Important**: Please submit the PR from the `feature/dom-pruning-code-only` branch.

Refer to [PR-GUIDE.md](./PR-GUIDE.md) for details.

### Concise Steps
```bash
# Create code-only branch (start from main)
git switch -c feature/dom-pruning-code-only main
git checkout feature/dom-pruning -- src/ assets/locales

# Format and build
npm run format
npm run build

# Commit and push
git add -A
git commit -m "feat: DOM pruning with memory optimization"
git push origin feature/dom-pruning-code-only

# Create PR on GitHub
```

## Test Verification List
- [ ] Delete Mode OFF: Traditional behavior (hide only)
- [ ] Delete Mode ON: Physical deletion of old messages
- [ ] Hidden Buffer 0: Delete immediately after the hidden boundary
- [ ] Hidden Buffer > 0: Maintain N hidden messages
- [ ] Show Older: Restore messages from the buffer
- [ ] Reload: Restore full history
- [ ] DevTools Network: Confirm no external communication
- [ ] Long threads (hundreds of messages): No performance issues

## Future Improvements (Recommended as Spin-off PRs)
- Split `src/content.js` (UI, Logic, Observer)
- Add unit tests (Jest)
- Add E2E tests (Playwright)
- Explicitly define CSP (`manifest.json`)

## Reference Resources
- [Design Details](./dom-pruning-plan.md)
- [Testing Procedures](./testing.md)
- [Performance Measurement](./perf-measurement-plan.md)
