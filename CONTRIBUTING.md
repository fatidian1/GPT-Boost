# Contributing to GPT Boost (fork)

Thanks for your interest in contributing! This fork implements an optional DOM pruning mode to physically delete old messages and improve performance.

## Development setup
- Node.js LTS recommended
- Install dependencies: `npm install`
- Build for development: `npm run start`
- Build for release: `npm run build`
- Load `dist/` as an unpacked extension in your browser

## Branching and commits
- Branch off from `main` (or `origin/main`) using a feature branch, e.g. `feature/dom-pruning`
- Use clear commit messages (conventional style preferred):
  - `feat: ...`, `fix: ...`, `docs: ...`, `chore: ...`

## Code style
- Prettier is configured. Please format before committing.
- Keep changes minimal and focused. Avoid unrelated refactors.

## Testing and validation
- Follow the manual test plan in `docs/testing.md`
- Follow the performance plan in `docs/perf-measurement-plan.md`
- Ensure no console errors in typical flows

## Opening a Pull Request
- Use the PR template provided (auto-included)
- Include screenshots for UI changes where applicable
- Call out any known limitations and follow-up work
