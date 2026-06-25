---
package: '@flighthq/lifecycle'
updated: 2026-06-25
basedOn: ./review.md
---

# Assessment: @flighthq/lifecycle

The merge review verdict is **revise — 58/100**. The integration delta is the right shape and tracks the drafted charter, but it does not compile: the implementation in `b2824e3d8:packages/lifecycle/src/lifecycle.ts` was written against `@flighthq/types` members (`AppLaunchKind`, `AppMemoryPressure`, `LifecycleBackend.getLaunchKind`/`.subscribeMemoryWarning`, and the `onMemoryWarning`/`onSaveState`/`onRestoreState` signals) that were **never added** to `packages/types/src/Lifecycle.ts`. That single types-first violation is the merge blocker; once the header is extended, the rest of the delta is mergeable. The blocker itself is a cross-package change (`@flighthq/types`), so it is **not** a within-`lifecycle` sweep item — it must go to the integration worker as a directive (see `outgoing/integration/lifecycle.md`).

## Recommended

_Sweep-safe, within-`lifecycle`, non-design. Safe to do in a within-package pass; none of these clear the merge blocker on their own (the blocker lives in `@flighthq/types`)._

- **Refresh the `package.json` `description`** to name the surface the delta actually ships (memory-pressure, save/restore-state, cold/warm launch) instead of the stale "foreground/background lifecycle state and resume/pause/back signals". One-line edit inside the package; the surface grew in this delta but the description did not.
- **Reconcile the `subscribeMemoryWarning` header comment with its body.** The function comment (`lifecycle.ts:86-88`) omits the unknown-pressure→`'moderate'` mapping that the body performs (`lifecycle.ts:149-151`). Make the durable comment complete. Cosmetic, within-cell.

## Backlog

_Parked: cross-package, design-decision, or larger than a within-cell sweep._

- **[BLOCKER — cross-package] Add the missing lifecycle types to `@flighthq/types`.** Parked here because it touches `@flighthq/types`, not `lifecycle` — but it is the gating fix and is dispatched to the integration worker. Add `AppLaunchKind` and `AppMemoryPressure`, the three new `AppLifecycle` signals, and the two optional `LifecycleBackend` methods to `packages/types/src/Lifecycle.ts` so the package compiles. _Why parked from Recommended:_ a reviewer must not edit another package; this is an integration-worker directive.
- **`getAppLaunchKind` fallback default ('warm' vs 'cold').** The minimal-backend fallback returns `'warm'` while the web path defaults to `'cold'`; pick one deliberately. _Why parked:_ a small design call for the user, not a mechanical sweep.
- **Property/fuzz coverage for transition storms.** Rapid blur/focus/visibility coalescing deserves property tests. _Why parked:_ Gold-tier hardening, larger than a sweep, and was already flagged in the prior maturation roadmap.

## Approved

_None. Approval is the user's verbal gate; this section is filled only when the user blesses an item. Surfaced design forks (memory-warning home, the 4-edge set, idle ownership, native-producer posture) belong to the charter's Open directions, not here._

## Notes for the charter's Open directions

These are forks the delta surfaces or re-confirms; route them to `charter.md › Open directions`, not into Recommended:

- **Memory-warning home.** The delta keeps `onMemoryWarning` in `lifecycle`. Confirm vs a `@flighthq/power`-adjacent home (the charter already carries this as an open direction).
- **Native-producer posture for seam-only signals.** `onBackButton` and `onMemoryWarning` have no reliable web producer; carrying their signatures ahead of a `host-*` producer is fork D — confirm.
- **Save/restore payload shape.** The delta ships the mutable `Record<string, unknown>` bag (`lifecycle.ts:38-39,66-68`). Confirm this is the blessed shape vs the `out`-param struct the roadmap floated, and that the app — not `lifecycle` — owns the storage call.
- **Is the 4-edge signal set in scope?** First-class `onBackground`/`onForeground` edges vs deriving from `onStateChange` — fork F, unresolved.
- **Package Map line stale-by-omission.** `tools/agents/docs/index.md`'s lifecycle entry predates the delta's memory/save-restore/launch-kind surface — a doc revision for the user, not an in-cell change.
