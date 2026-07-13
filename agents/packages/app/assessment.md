---
package: '@flighthq/app'
updated: 2026-07-13
basedOn: ./review.md
---

# app — Assessment

See [charter](./charter.md) for blessed direction. Refreshed against the 2026-07-13 review (solid — 84): the types header has landed, the package compiles, and the 42-export scope ceiling holds.

## Recommended

Sweep-safe, within-package, no design fork:

1. **Honor unsubscribe in the `subscribeReady` web fill** — guard the microtask dispatch with a flag the returned unsubscribe flips, and drop the dead `const id = …; void id;` binding (`app.ts:245-250`). Web-only behavior fix; no signature change. — review.md gap 1.
2. **Alphabetize `getLoginItem` in `createWebAppBackend`** — move the key up into alpha position with the other `get*` members (`app.ts:149`). Cosmetic scan-ability fix flagged twice now. — review.md gap 2.

## Approved

None.

## Backlog

- **`AppPathKind` breadth / filesystem-paths boundary** — parked design fork: whether the full native path-family set (temp, desktop, documents, downloads, home…) lives here or in `@flighthq/filesystem`. The largest native-fidelity gap; needs a direction ruling. — review.md gap 3.
- **Jump-list / dock-menu unification** — cross-platform design decision already in the charter's Open directions; Windows jump-list tasks have no expression today. — review.md gap 4.
- **About-panel surface** — scope call for "who you are to the OS"; raise at direction, don't build speculatively. — review.md gap 5.
- **Retire the stale `AppLaunchKind`/`AppMemoryPressure` open direction** — charter edit (out of builder bounds): both types are implemented by `@flighthq/lifecycle` in-tree.
- **One-concept-per-file split of the `App.ts` types** (`AppActivationPolicy`/`AppLoginItem`/`AppPathKind` into own files) — cross-boundary (`@flighthq/types`); flag for the types-layout checker.
- **Widen the Package Map line** — cross-boundary (`agents/index.md`); "identity, badge, dock" understates the shipped surface.
