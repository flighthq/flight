---
package: '@flighthq/statusbar'
status: partial
score: 35
updated: 2026-06-25
ingested:
  - status.md
  - source
  - base=origin/main(eb73c3d74)
  - evidence=integration-b2824e3d8 delta
---

# statusbar — Review

Harsh **merge-gate** review of the `integration-b2824e3d8` delta (head) against the **approved** `origin/main` (`eb73c3d74`) baseline. Only the delta is judged. The baseline `statusbar` is the blessed floor and is not under review.

## Verdict in one line

**REJECT as-is.** The implementation is well-designed and would be a strong Bronze→Gold lift — but the delta is **internally broken**: every new symbol the head code imports from `@flighthq/types` (`StatusBar`, `StatusBarInfo`, `StatusBarAnimation`, `StatusBarStyleEntry`, `StatusBarStyleEntryHandle`) and every new backend method it calls (`getInfo`, `subscribe`, the `animated`/`animation` params) **do not exist** in the integration tree. The package cannot compile. The companion `status.md` claims the types were added; the diff proves they were not.

## The blocking defect — the type contract was never committed

The head `statusbar.ts` opens with:

```ts
// b2824e3d8:packages/statusbar/src/statusbar.ts
import { createSignal, emitSignal } from '@flighthq/signals';
import type {
  StatusBar,
  StatusBarAnimation,
  StatusBarBackend,
  StatusBarInfo,
  StatusBarStyle,
  StatusBarStyleEntry,
  StatusBarStyleEntryHandle,
} from '@flighthq/types';
```

But `incoming/integration-b2824e3d8/head/packages/types/src/StatusBar.ts` is **byte-identical to base** (`diff base/.../StatusBar.ts head/.../StatusBar.ts` → exit 0). It still declares only:

```ts
// b2824e3d8:packages/types/src/StatusBar.ts (unchanged from base)
export type StatusBarStyle = 'light' | 'dark' | 'default';
export interface StatusBarBackend {
  setStyle(style: StatusBarStyle): void;
  setVisible(visible: boolean): void;
  setBackgroundColor(color: number): void;
  setOverlaysContent(overlay: boolean): void;
}
```

The new symbols are referenced **only** inside `statusbar.ts` and `statusbar.test.ts` — they are defined nowhere in the tree (`grep -rln 'StatusBarInfo\|StatusBarStyleEntry\|StatusBarAnimation' head/packages` returns just those two files). Consequences, each independently fatal to compile:

- **Missing type imports.** `StatusBar`, `StatusBarInfo`, `StatusBarAnimation`, `StatusBarStyleEntry`, `StatusBarStyleEntryHandle` resolve to nothing — `tsc -b` cannot type the module.
- **Backend method calls the interface does not have.** `getStatusBarInfo` calls `getStatusBarBackend().getInfo(out)` and `attachStatusBar` calls `backend.subscribe(...)`, but the committed `StatusBarBackend` has neither `getInfo` nor `subscribe`.
- **Backend signature drift.** `setStatusBarColor(color, animated)` forwards to `setBackgroundColor(color, animated)` and `setStatusBarVisible(visible, animation)` forwards to `setVisible(visible, animation)`, but the committed interface methods take a single argument each.

The patch's file list (`grep '^diff --git' changes.patch`) confirms it touches `packages/statusbar/{package.json,src/statusbar.ts,src/statusbar.test.ts,tsconfig.json}` and the four `docs/packages/statusbar/*` files — and **nothing under `packages/types/`**. The types half of this feature was dropped on the floor before integration. This is a delta defect (the base imported only the two symbols that exist), not a baseline critique.

## Honesty failure — status.md contradicts the diff

`b2824e3d8:agents/packages/statusbar/status.md` (as-claimed, builder-67dc46d64) asserts:

> ### New types in `@flighthq/types` (`StatusBar.ts`)
>
> - `StatusBarAnimation` … `StatusBarInfo` … `StatusBarStyleEntry` … `StatusBarStyleEntryHandle` … `StatusBar` … Extended `StatusBarBackend` with `getInfo` … `subscribe` …

None of this is in the diff. The continuity log's own banner flags entries as "as-claimed until a review pass verifies them against the diff" — this review is that pass, and the claim **fails verification**. The estimated "95/100 (gold)" is unreachable: the package does not build.

## What the delta gets right (judged on its merits, conditional on the types landing)

This is not sloppy work — it is _unwired_ work. Were the matching `@flighthq/types` change present, most of this would pass the bar:

1. **Composition / bedrock — PASS (design).** The added surface decomposes cleanly: a read side (`createStatusBarInfo` / `getStatusBarInfo` / `getStatusBarHeight`), an event entity (`createStatusBar` / `attachStatusBar` / `detachStatusBar` / `disposeStatusBar`), and an RN-style style stack (`pushStatusBarStyleEntry` / `popStatusBarStyleEntry`). No god-function; `_applyTopStyleEntry` is a single private merge helper. No config-gated feature branches in a hot loop.
2. **Naming clarity — PASS.** Full unabbreviated type words throughout (`pushStatusBarStyleEntry`, `getStatusBarHeight`), correct `get*` accessors, `dispose*` used correctly (`disposeStatusBar` detaches the subscription and releases to GC — no native resource to free, so `dispose` not `destroy` is right per the teardown-verb rule).
3. **Tree-shaking / bundle invariant — PASS.** `package.json` keeps `"sideEffects": false`, a single `"."` export, and module state lives at the file bottom under the loose-variable convention. The new `@flighthq/signals` dependency (+ `tsconfig` reference) is justified by the `onChange` event entity and matches the platform-suite event-cell pattern.
4. **Registry vs closed union — N/A.** No kind/handler family here; backend-seam capability.
5. **Subject triad — N/A.** No format/backend split implicated.
6. **Contract hygiene — MIXED.** `getStatusBarInfo(out)` is a correct out-param with an explicit alias-safety comment and an alias test; sentinels are used for expected failure (`popStatusBarStyleEntry` no-ops on an unknown handle, `-1`/`INVALID_HANDLE`; `_webReadThemeColor` returns `0` on parse failure rather than throwing). **But** the entire hygiene story is moot until the types land — the contract it implements against is absent, which is itself the gravest contract-hygiene failure (types-first was inverted: the implementation shipped, the header did not).
7. **Tests & honesty — MIXED.** The test file is thorough, colocated, alphabetized, and mirrors the new exports — but it imports the same non-existent types and **cannot compile**, so it is not a passing suite; and its parent `status.md` overstates what landed (see above).

## Minor notes (not blocking, surface in assessment)

- `enableStatusBarSignals()` is a pure documentation-marker no-op (its own comment says so). The `enable*` convention exists to gate an opt-in _cost_; signals here are always present, so the marker buys nothing concrete. Worth a design question rather than retention by default.
- `popStatusBarStyleEntry`'s afterEach reset in the test (`for (let i = 0; i < 100; i++) popStatusBarStyleEntry(i)`) is a brittle handle-space sweep that leans on handles being small integers; fine for a stub test, but a `clearStatusBarStyleStack()` test helper would be cleaner.

## Bottom line

The design is Gold-shaped; the integration is broken. This must not merge until the `@flighthq/types` `StatusBar.ts` change that the implementation was written against is committed and the package type-checks and tests green. See `assessment.md` for routing and `outgoing/integration/statusbar.md` for the worker dispatch.
