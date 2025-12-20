# Performance Measurement Plan

## Goals
- Validate that DOM pruning reduces render/layout overhead and memory use on long threads.

## Metrics (manual/observational)
- DOM Nodes: Inspect Elements count in DevTools > Elements > Bottom summary
- Memory: DevTools Performance/Memory panel (take heap snapshot before/after)
- Responsiveness: Subjective typing and scroll latency

## Procedure
1. Baseline (hide mode):
   - Create a long conversation (> 200 messages)
   - Record DOM node count and take a heap snapshot
2. Delete mode:
   - Enable delete mode and reload to ensure clean state
   - Post more messages until threshold trims
   - Record DOM node count and heap snapshot again
3. Compare
   - Expect materially fewer nodes and lower retained size

## Notes
- Keep other tabs minimal; use same browser/profile for A/B.
- Measurements are indicative (no automation included in this repo).
