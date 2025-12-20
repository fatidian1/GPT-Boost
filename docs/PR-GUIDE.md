# DOM Pruning Feature — PR Submission Guide

This document describes the procedure for submitting a PR for the DOM Pruning feature to the upstream repository.

## Overview

In this feature, we added:
- **DOM Delete Mode**: Physically deletes old messages to save memory (opt-in)
- **Hidden Buffer**: Keeps a certain number of messages in the DOM before deletion, allowing restoration via "Show Older"
- **UI/Settings Panel**: Added Delete Mode and Hidden Buffer settings to the options screen
- **Multi-language Support**: Added i18n keys for all 19 locales

## Preparation Before PR Submission (Recommended Flow)

### Step 1: Create a Code-Only Branch

By including only the minimal changes in the PR, you reduce review workload and make acceptance easier.

**Create a dedicated branch containing only code-related files:**

```powershell
# Create a new branch from main
git switch -c feature/dom-pruning-code-only main

# Import only code-related files from feature/dom-pruning
git checkout feature/dom-pruning -- `
  src/content.js `
  src/options.js `
  src/options.html `
  src/manifest.json `
  assets/locales
```

### Step 2: Format and Build Verification

```powershell
# Standardize formatting with Prettier
npm run format

# Confirm successful build
npm run build
```

### Step 3: Commit and Create PR

```powershell
# Commit
git add -A
git commit -m "feat: DOM pruning with memory optimization

- Add physical message deletion mode (opt-in)
- Implement hidden buffer for Show Older recovery
- Add DOM Pruning settings to options panel
- Add i18n support for 19 locales"

# Push to remote and create PR
git push origin feature/dom-pruning-code-only
```

### Step 4: Include the following in the PR description

```markdown
## Changes

- **Feature**: Physical deletion option for old messages + restorable Hidden Buffer
- **Security**: Manifest permissions minimized (storage only), no external communication
- **Locales**: Full support for 19 locales

## Review Points

### Security (Required)
- [ ] No unnecessary permissions in manifest (check host_permissions too)
- [ ] No fetch/XHR/WebSocket/eval/new Function etc. in src/
- [ ] Delete Mode is opt-in, with an irreversibility warning in the UI

### Functional Verification (Recommended)
- [ ] Boundary value test for hiddenDomBuffer (0, 1, large values)
- [ ] Switching behavior with Delete Mode OFF/ON
- [ ] Performance in long conversations (hundreds of messages)
- [ ] Confirm no external communication in DevTools Network tab

### Code Quality
- [ ] i18n keys added to all locales
- [ ] Formatting verified with npm run format
- [ ] npm run build successful

## Test Environment

Chrome / Edge (Manifest v3)
```

## Parallel Work (Keep original branch as is)

- Keep the `feature/dom-pruning` branch **locally** as the full version including documentation and settings.
- Submit the PR using `feature/dom-pruning-code-only`.
- After the PR is merged, perform splitting/refactoring as spin-offs if necessary (adding tests, file splitting, etc.).

## Frequently Asked Questions

**Q: Should I include documentation (docs/) in the PR?**  
A: No. Since we use a code-only branch, it won't be included in the PR. Documentation remains in your fork.

**Q: What about version updates?**  
A: After merging, the repository maintainer will update the versions in package.json and manifest.json (you can suggest this).

**Q: Are tests mandatory?**  
A: Since there are no unit tests, include "manual test procedures" in the PR so that reviewers can verify behavior in Chrome developer mode.

**Q: Is Delete Mode really irreversible?**  
A: Yes. It can be restored with "Show Older" until the page is reloaded, but once reloaded, deleted messages must be retrieved from the server (this is by design).

## Checklist (Before Creating PR)

- [ ] `feature/dom-pruning-code-only` branch created
- [ ] npm run format → npm run build successful
- [ ] Clear and understandable commit messages in Git log
- [ ] PR description includes changes and review points
- [ ] Pushed the fork-side branch to the origin repository
- [ ] Created PR on GitHub and specified reviewers / Maintainer
