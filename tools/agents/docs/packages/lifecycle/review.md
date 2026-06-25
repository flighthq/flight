---
package: '@flighthq/lifecycle'
status: partial
score: 58
updated: 2026-06-25
ingested:
  - base=origin/main(eb73c3d74)
  - evidence=integration-b2824e3d8 delta
  - head/packages/lifecycle/src
  - head/packages/types/src/Lifecycle.ts
  - changes.patch (packages/lifecycle slice)
  - charter.md (draft)
---

# lifecycle — Merge Review (integration-b2824e3d8 delta vs approved origin/main eb73c3d74)

This is a **merge-gate** review of the incoming change only. The approved baseline (`base/packages/lifecycle/`) is the blessed floor and is not under review. The delta roughly triples the package: source `3.6K → 11K`, test `3.6K → 13.8K`. It adds three feature clusters — a third `inactive` state edge driven by window focus/blur, a save/restore-state bag, an OS memory-pressure channel, cold/warm launch classification, three `is*` booleans, and a vetoable back-button request — all matching the drafted (unblessed) charter's in-scope list.

The work itself is well-crafted. It fails the gate on **one** hard, mechanical defect: the implementation grew its type surface but the header layer in `@flighthq/types` was never updated, so the package does not compile.

## Verdict: REVISE — one compile-breaking, contract-violating blocker; otherwise mergeable.

## Blocker — the new type surface is absent from `@flighthq/types` (the package does not compile)

`b2824e3d8:packages/lifecycle/src/lifecycle.ts:1-8` imports two types that **do not exist anywhere in the head tree**:

```ts
import type {
  AppLaunchKind,
  AppLifecycle,
  AppLifecycleState,
  AppMemoryPressure,
  LifecycleBackend,
} from '@flighthq/types';
```

A grep of the entire head `packages/` tree (and the whole head worktree) finds `AppLaunchKind` and `AppMemoryPressure` only in `lifecycle.ts` and `lifecycle.test.ts` — never in any `@flighthq/types` source. The header file is **byte-for-byte unchanged** between base and head (`b2824e3d8:packages/types/src/Lifecycle.ts` is identical to base), and `changes.patch` does not touch `packages/types/src/Lifecycle.ts` at all. The head `Lifecycle.ts` still declares only the four-signal entity and the two-method backend:

```ts
export interface LifecycleBackend {
  getState(): AppLifecycleState;
  subscribe(listener: () => void): () => void;
}
export interface AppLifecycle {
  onStateChange;
  onResume;
  onPause;
  onBackButton; // four signals, no more
}
```

Yet the head implementation references, against those interfaces:

- `getAppLaunchKind(): AppLaunchKind` and `backend.getLaunchKind` (`b2824e3d8:packages/lifecycle/src/lifecycle.ts:122,187-189`)
- `backend.subscribeMemoryWarning` + `AppMemoryPressure` (`b2824e3d8:packages/lifecycle/src/lifecycle.ts:46-51,132`)
- `app.onMemoryWarning`, `app.onSaveState`, `app.onRestoreState` (`b2824e3d8:packages/lifecycle/src/lifecycle.ts:39,48-50,66-68`)

None of these members exist on the `@flighthq/types` interfaces they are read from. `tsc -b` will fail with unresolved-import and missing-property errors; `npm run check` (typecheck + exports:check) cannot pass; the package cannot build. This is a hard merge blocker. It also directly violates the **types-first** contract from the codebase map ("define its types in `@flighthq/types` first, then implement against them — the header is the design surface"): the implementation is ahead of its header. The fix is mechanical — extend `Lifecycle.ts` to add `AppLaunchKind`, `AppMemoryPressure`, the three new `AppLifecycle` signals, and the two optional `LifecycleBackend` methods — but until it lands the candidate does not compile and must not merge.

## The seven standards (delta judged against each)

1. **Composition / bedrock — PASS.** The cell is a single event-capability composed of independent free functions over one `LifecycleBackend` seam and one `AppLifecycle` entity. The added clusters (memory, save/restore, launch-kind, back) are not config-gated branches fused into a god-function; each is its own export and its own backend method. `attachAppLifecycle` gains save/restore and a guarded memory subscription, but only callers who opt into delivery pay for them (`b2824e3d8:packages/lifecycle/src/lifecycle.ts:45-51` gates the memory wire behind `if (memSub !== undefined)`). The memory-pressure-vs-`@flighthq/power` home is a genuine fork, already raised in the charter's Open directions — a design question, not a delta defect.

2. **Naming clarity — PASS.** New exports `getAppLaunchKind`, `isAppActive`, `isAppBackground`, `isAppInactive`, `requestAppBack` follow the package's established `App*` prefix and the `get*`/`is*` rules. `requestAppBack` is a faithful 1:1 of `application`'s `requestWindowClose` (`application/src/window.ts:552`), same veto contract, same boolean direction (`b2824e3d8:packages/lifecycle/src/lifecycle.ts:224-227` returns `app.onBackButton.data?.cancelled !== true`). New type names `AppLaunchKind`/`AppMemoryPressure` read clearly — they just need to _exist_ (see blocker).

3. **Tree-shaking / bundle invariant — PASS.** `package.json` is unchanged: `"sideEffects": false`, single `.` export, no per-file subpaths. No top-level wiring is added — module state stays lazy at the file bottom (`_backend`, `_savedState`, `_subscriptions` at `b2824e3d8:packages/lifecycle/src/lifecycle.ts:234-236`). The new `is*`/launch/back functions are independent and tree-shake individually. No new branch is added to a shared hot loop that unrelated importers would pay.

4. **Registry vs closed union — PASS.** Lifecycle state is a genuinely closed tri-state (`'active' | 'inactive' | 'background'`); the implementation branches with `if/else`, not a `switch(kind)` over a growing handler family. This is bedrock-closed, not a registry candidate.

5. **Subject triad + plurality guard — PASS (N/A).** No format codecs and no backend plurality. The single web/native `LifecycleBackend` seam is the standard event-capability shape, not a premature `<subject>-<backend>` split.

6. **Contract hygiene — FAIL (the blocker).** Types-first is violated: the new cross-package types were implemented before being defined in `@flighthq/types`. Otherwise hygiene is good: sentinels not throws (web backend degrades to `'active'` / no-op in SSR, `b2824e3d8:packages/lifecycle/src/lifecycle.ts:93,98,138`), `dispose*` correctly detaches-and-releases-to-GC and now also clears the saved-state bag (`b2824e3d8:packages/lifecycle/src/lifecycle.ts:178-181`), the optional backend methods are read defensively (`backend.getLaunchKind !== undefined`, `b2824e3d8:packages/lifecycle/src/lifecycle.ts:189`). The save-state bag is a mutable `Record<string, unknown>` handed to listeners — intentionally mutable (it is the output of `onSaveState`), so the `Readonly<>` default does not apply there.

7. **Tests & honesty — PASS (mechanically blocked).** Test quality is strong: every export has a colocated test, `describe` blocks are alphabetized and mirror exports 1:1 (verified), and coverage is real — the dedup edges (`active↔inactive↔background` not double-firing pause, `b2824e3d8:packages/lifecycle/src/lifecycle.test.ts:85-97`), idempotent re-attach, save→restore round-trip, memory delivery + unsubscribe, and the four launch-kind cases. The tests do, however, share the blocker: they import `AppMemoryPressure` and exercise `subscribeMemoryWarning`/`getLaunchKind`/`onSaveState` members that the types do not declare, so `tsc -b` over `*.test.ts` fails alongside the source.

## Secondary (non-blocking) observations on the delta

- **Surface/description drift (delta-introduced).** The delta grew the public surface but left the package's self-description stale. `package.json`'s `description` is unchanged ("foreground/background lifecycle state and resume/pause/back signals") and omits memory-pressure, save/restore, and launch-kind; the codebase-map Package Map line is likewise stale-by-omission. The charter already lists the Package Map line as an Open direction; the `package.json` description is a one-line within-package cleanup the delta should have included.

- **`getAppLaunchKind` 'warm' fallback is a surprising default.** When a backend omits `getLaunchKind`, `getAppLaunchKind` returns `'warm'` (`b2824e3d8:packages/lifecycle/src/lifecycle.ts:187-190`), while the web backend itself defaults to `'cold'` (`b2824e3d8:packages/lifecycle/src/lifecycle.ts:127-130`). 'cold' is the conservative default used by the web path; the 'warm' fallback for minimal backends is defensible but worth a one-line rationale or a flip to 'cold'. Open question for the user, not a blocker.

- **Memory-pressure comment drift.** The top-of-function comment (`b2824e3d8:packages/lifecycle/src/lifecycle.ts:86-88`) describes only the `'critical'`→`'critical'` and resolution→`'normal'` mappings, while the body also maps unknown pressure to `'moderate'` (`b2824e3d8:packages/lifecycle/src/lifecycle.ts:149-151`). The richer inline comment is correct; the header comment is incomplete. Cosmetic.

## Bottom line

The delta is the right shape and matches the drafted charter — but it ships an implementation against a header that was never updated, so it does not compile and breaks the types-first contract. One mechanical fix (extend `@flighthq/types`'s `Lifecycle.ts`) clears the gate. Score reflects strong craft gated behind a hard compile failure.
