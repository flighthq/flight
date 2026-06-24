---
package: '@flighthq/lifecycle'
updated: 2026-06-24
basedOn: ./review.md
---

# Assessment: @flighthq/lifecycle

The review verdict is **solid — 86/100**. Nearly all of the prior maturation roadmap (Bronze + the full Silver surface) has already landed and is verified against the diff: the real `'inactive'` state, the boolean conveniences, `onMemoryWarning`, `getAppLaunchKind`, vetoable `requestAppBack`, and `onSaveState`/`onRestoreState`. What remains is mostly user-decision (the 4-edge set, idle ownership, memory-warning home, surface additions) and cross-package proof (native backends, the Rust crate) — neither of which is sweep-safe. The one squarely-within-cell, non-design hardening item is the property/fuzz test pass over transition storms.

## Recommended

Sweep-safe: within `@flighthq/lifecycle`, no cross-package coupling, no breaking change, no open design decision. Safe to bless as a set.

- **Debounce/coalescing property tests over transition storms.** `onStateChange` is already documented "raw, not deduped" and the `onResume`/`onPause` edge derivation is unit-tested, but there are no fuzz/property tests over rapid blur/focus/pagehide/pageshow storms collapsing to the minimal correct edge set (review.md#gaps, roadmap Gold). This validates already-built, already-documented behavior — it adds coverage, not surface, and decides nothing. Colocated in `lifecycle.test.ts`, `describe` blocks alphabetized to mirror exports.

## Backlog

Parked: each waits on a user decision, a surface addition the charter has not asked for, a cross-file edit under the user's gate, or a cross-package dependency.

- **`timeInBackground` on the `onResume` payload (ms, `-1` when unknown).** The entity already tracks the save edge so the last-background timestamp is cheap (review.md#gaps), but the review itself flags it as a _surface addition the charter has not asked for_ — "surface it rather than assume" (review.md candidate open directions). It is an Open direction, not Recommended, until the charter asks for it.
- **First-class `onBackground`/`onForeground` (+ `onActivate`/`onResignActive`) — the 4-edge set.** Needs a user decision on whether the extra surface is worth it vs. deriving from `onStateChange` (review.md#gaps, the largest "is the surface complete" question). Correctly _not_ built; routed to Open directions.
- **Idle / user-inactivity (`onUserIdle`/`onUserActive`).** Deferred pending an ownership decision against `@flighthq/input` — a cross-package boundary call, not sweep-safe (review.md candidate open directions, roadmap Gold).
- **In-box native producer for back button / memory warning.** `onBackButton` has no web emitter and `subscribeMemoryWarning` rides experimental events that never fire in shipping browsers; a reliable producer requires a native host (`host-electron`/`host-capacitor`) filling the seam — cross-package (review.md#gaps, roadmap Gold).
- **`flighthq-lifecycle` Rust crate + native-backend proof.** Out of this worktree's scope (the `rust` worktree / `host-*`); the Gold-tier conformance work (review.md#gaps, roadmap Gold).
- **Package Map line widening.** `tools/agents/docs/index.md`'s `@flighthq/lifecycle` entry predates `onMemoryWarning`, save/restore-state, and launch-kind. A doc edit outside the package, under the user's gate (review.md contract & docs fit).

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on their say-so._

## Routed to the charter's Open directions

Not edited into the charter here — surfaced for an explicit direction conversation:

- **Is the 4-edge signal set in scope** (`onBackground`/`onForeground` + `onActivate`/`onResignActive`), or is deriving from `onStateChange` the blessed answer? (fork F: thin-by-design vs under-built.)
- **Where does memory-warning live** — keep `onMemoryWarning` in `lifecycle`, or a `@flighthq/power` -adjacent home? Review's lean: keep it here, but the boundary is uncharted.
- **Idle-detection ownership** — `lifecycle` vs `@flighthq/input` for `onUserIdle`/`onUserActive`. Resolve before anyone builds it.
- **State-restoration payload shape** — confirm the mutable `Record<string, unknown>` bag (not an `out`-param struct) is blessed, and that the app (not `lifecycle`) owns the storage call so the cell stays dependency-light.
- **Is `timeInBackground` wanted?** Cheap and canonical for cache-TTL/re-auth, but a surface addition the charter has not requested.
- **`enableAppLifecycleSignals` / zero-cost-until-connected.** The signals are plain `createSignal()` with no per-listener cost, so no `enable*` opt-in is warranted — a one-line Decision candidate to record explicitly rather than leave implicit.
