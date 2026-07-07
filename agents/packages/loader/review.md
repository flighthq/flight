---
package: '@flighthq/loader'
status: partial
score: 38
updated: 2026-06-25
ingested:
  - status.md
  - charter.md
  - source
  - changes.patch
  - 'base=origin/main(eb73c3d74)'
  - 'evidence=integration-b2824e3d8 delta'
---

# loader — Merge Review (integration → origin/main)

Merge gate. Baseline is the **approved** `origin/main` (`eb73c3d74`) at `incoming/integration-b2824e3d8/base/packages/loader/` — not reviewed. The judged delta is `head` vs `base`, plus the `packages/loader/` hunks of `incoming/integration-b2824e3d8/changes.patch`. Findings reference `b2824e3d8:<path>`. The delta touches exactly two files: `src/resourceLoader.ts` (80 → 660 lines) and `src/resourceLoader.test.ts`. No `packages/types/` hunk in the patch touches any `ResourceLoad*` type.

## Verdict

`reject — 38/100`. The ambition is right and the test suite is well-shaped, but **this delta does not compile in the integration state it is being merged into**, and the failure is not incidental — it is structural. The expanded loader consumes an entire new `@flighthq/types` surface (`ResourceLoaderOptions`, `ResourceLoadItem`, `ResourceLoadHandle`, `ResourceLoadReport`, `ResourceLoadItemStatus`, `ResourceLoaderItemSignals`) and three new `ResourceLoader` signals (`onCancel`/`onPause`/`onResume`) plus a changed `onComplete`/`onError` payload — and **none of those types or signal fields exist in the head bundle's `@flighthq/types`.** It also imports `disconnectAllSlots` from `@flighthq/signals`, a function that does not exist (the real export is `disconnectAllSignals`). On top of the hard build breakage, the headline "byte progress / bandwidth" feature is dead code: `report.bytes` is provably always `0`. The score is a merge-gate score (distance to mergeable), not a grade on the design intent — the orchestration logic, if its header layer existed and its one import were corrected, would be a much higher number.

This is the inverse of the codebase's **types-first** law: the implementation was written and committed against a header layer that was never written. The package's own (draft) charter and the prior in-bundle review both already flag the dead byte tier; neither caught that the type surface is entirely absent from the delta, because they reasoned as if the types were present.

## Blocking defects (each must-fix before merge)

### 1. The new `@flighthq/types` surface is missing — hard compile failure

`b2824e3d8:packages/loader/src/resourceLoader.ts:1-9` imports six types from `@flighthq/types`:

```ts
import type {
  ResourceLoader,
  ResourceLoaderItemSignals,
  ResourceLoaderOptions,
  ResourceLoadHandle,
  ResourceLoadItem,
  ResourceLoadItemStatus,
  ResourceLoadReport,
} from '@flighthq/types';
```

Of these, only `ResourceLoader` exists in the head bundle. `incoming/integration-b2824e3d8/head/packages/types/src/ResourceLoader.ts` is **byte-identical to base** and contains only the original three-signal interface. A grep across `head/packages/types/src/` for any of `ResourceLoaderOptions | ResourceLoadHandle | ResourceLoadItem | ResourceLoadReport | ResourceLoaderItemSignals | ResourceLoadItemStatus` returns nothing, and `changes.patch` adds several `packages/types/` files (`FontMetrics.ts`, `ShapedRun.ts`, `TextShaper.ts`, …) but **no `ResourceLoad*` file**. The test file compounds it: `b2824e3d8:packages/loader/src/resourceLoader.test.ts:2` does `import type { ResourceLoadHandle, ResourceLoadReport } from '@flighthq/types'`. Both source and test fail to typecheck. The status doc claims these types were "Implemented … in `@flighthq/types`" (`status.md` › _Types in `@flighthq/types`_) — the diff disproves the claim.

### 2. `ResourceLoader` interface lacks the new signals and payloads it is assigned/read

`b2824e3d8:packages/loader/src/resourceLoader.ts:140-160` (`createResourceLoader`) assigns `onCancel`, `onPause`, `onResume` and emits `onComplete`/`onError` with new arguments (`emitSignal(loader.onComplete, internal.reports)`, `emitSignal(loader.onError, error, entry.key)`), but `head/packages/types/src/ResourceLoader.ts` is unchanged:

```ts
export interface ResourceLoader {
  onComplete: Signal<() => void>;
  onError: Signal<(error: unknown) => void>;
  onProgress: Signal<(loaded: number, total: number) => void>;
}
```

`loader.onCancel`/`onPause`/`onResume` do not exist on the type; `emitSignal(loader.onComplete, internal.reports)` passes an argument to a `Signal<() => void>`. The test reads `loader.onCancel` (`…test.ts:30`) and expects a reports payload on `onComplete` (`…test.ts:23, 937-941`). All are type errors against the shipped interface.

### 3. `disconnectAllSlots` is not a `@flighthq/signals` export

`b2824e3d8:packages/loader/src/resourceLoader.ts:1` imports `disconnectAllSlots` and calls it ten times in `disposeResourceLoader` (`…:204-216`). The signals package exports **`disconnectAllSignals`** (`head/packages/signals/src/slot.ts:34`), not `disconnectAllSlots`; there is no `disconnectAllSlots` anywhere in `packages/signals/src/`. This is an independent hard import error — even if defects 1 and 2 were fixed, `disposeResourceLoader` would not resolve.

### 4. The "byte progress" feature is dead — `report.bytes` is always `0`

`b2824e3d8:packages/loader/src/resourceLoader.ts:314` sets `entry.bytesLoaded = 0` at queue time, and the value is **only ever read** into the report (`bytes: entry.bytesLoaded` at `:510`, `:533`, `:578`) — it is never written anywhere else. `entry.onBytesProgress` is stored (`:317`) but **never invoked** at any callsite. The in-source comment at `:490-493` asserts the opposite of the code:

```ts
// The entry's `onBytesProgress` is a tracking shim (set up in
// queueResourceLoad) that also writes `entry.bytesLoaded`, enabling the report's `bytes`
// field.
```

No such shim is set up; `entry.onBytesProgress` is the raw descriptor callback and nothing calls it, so `entry.bytesLoaded` can never leave `0`. The feature is wired to produce a constant. By the charter's own "honest features only" line, a tier that "can only ever produce a constant" is a defect, not partial credit. The whole `bytes` / `onBytesProgress` / `bytesHint` / `maxBytesPerSecond` cluster either has to be made real (a breaking factory-signature change — a design decision, see Open directions) or cut.

## Non-blocking findings (judged on the delta)

- **Sentinel violation — `getResourceLoadItemStatus` returns `'pending'` for an unknown key.** `b2824e3d8:packages/loader/src/resourceLoader.ts:228-238`: after checking reports/pending/in-flight, the fallthrough is `return 'pending'`, so an unknown key is indistinguishable from a genuinely-queued one. The contract says expected-failure lookups return a sentinel (`null`/`-1`/`false`), not a valid in-band value. Needs an `'unknown'`/`'missing'` status member or a `null` return — a small type-shape decision (Open direction), so non-blocking for the gate but a real contract miss the delta introduces.

- **Composition smell — 660-line monolith with feature branches in the hot drain.** `resourceLoader.ts` bundles, in one file, the worker pool, retry/backoff (`computeRetryDelay`), the token-bucket throttle (`createTokenBucket`/`refillTokens`/`tokenBucketDelayMs`/`consumeTokens`), dedupe, priority sort, pause/resume, streaming, weight progress, byte tracking, and the `PendingEntry` pool. The throttle is gated _inside_ the dispatch loop — `b2824e3d8:…:340-360` adds an `if (internal.throttle !== null && entry.bytesHint > 0) { … await delay …}` branch that every `drainQueue` pass now pays. The token bucket is an extractable bedrock primitive (a generic rate limiter is not loader-specific); pulling it out would shrink the drain loop and let the throttle tree-shake when unused. The charter does want canonical batch-loader _breadth_, so this is a within-unit decomposition note, not a "wrong package" call — but the single-file all-branches shape is the within-unit form of the smell the codebase map warns about. Surface to the charter; not a gate blocker.

- **Module-scoped `PendingEntry` pool shared across all loader instances.** `b2824e3d8:…:26-66` declares `const pendingEntryPool: PendingEntry[] = []` at module scope (lazily populated, not an eager top-level side effect, so `sideEffects: false` still holds). `releasePendingEntry` does clear `resolve`/`reject`/`wrappedLoad`/`onBytesProgress` and swaps a fresh `AbortController`, so cross-instance reuse is _probably_ safe — but a global mutable pool shared by every loader in a process is a latent aliasing hazard the status itself flags. Acceptable for now; worth a charter note on whether the pool should be per-loader. Non-blocking.

## What the delta gets right (would survive once it compiles)

- **Naming is clean and contract-correct.** Full unabbreviated type words throughout (`cancelResourceLoad`, `getResourceLoadProgress`, `setResourceLoaderConcurrency`, `enableResourceLoaderItemSignals`); `get*` for accessors; `dispose*` is the correct verb — `disposeResourceLoader` detaches signal listeners to release the loader to GC and frees no non-GC resource, exactly the `dispose` vs `destroy` distinction. No abbreviations. Pass.
- **`enable*`-group signal opt-in is followed.** Per-item signals are off by default and activated lazily via `enableResourceLoaderItemSignals` (`…:175-186`), matching the signals cost-opt-in rule.
- **Packaging is untouched and compliant.** `package.json` keeps the single `.` export, `sideEffects: false`, and deps limited to `@flighthq/signals` + `@flighthq/types`. The barrel (`index.ts`) is a thin re-export. No registration at module top level.
- **Tests are well-structured and would be strong coverage.** `describe` blocks are alphabetized and mirror the exports 1:1; behavior is asserted against non-trivial outcomes (parallel vs sequential ordering, dedupe call-count, retry attempt-count, fail-fast `skipped` status, weight-aware progress fractions, pool reuse across batches). This is the right test shape — it simply cannot run until defects 1-3 are fixed, and the `bytes` tests (`…test.ts:127-202`) only ever assert `bytes >= 0` / `=== 0`, which is exactly the dead-tier tell.

## Contract & docs fit

The status doc (`status.md`) is **as-claimed and contradicted by the diff** on its central claim: it lists six `@flighthq/types` files as implemented (`ResourceLoadHandle.ts`, `ResourceLoadItem.ts`, …) and an `examples/batchloading/` example, none of which appear in `changes.patch`. The draft charter already (correctly) flags the byte tier as non-functional and the example as "absent from this bundle's delta," so the charter is ahead of the status doc here. The Rust mirror line (`crate: flighthq-loader`) is named in the charter front matter and is consistent.

## Why the score

A reject at the gate. Three independent hard compile failures (missing type surface, missing interface signals, missing signals export) each individually block the merge; together they show the change was authored against a header layer that was never committed. One shipped-as-real-but-dead feature (`report.bytes`). The 38 (vs the in-bundle review's 80 and the status doc's self-estimated 92) is the gap between "good orchestration design" and "mergeable into the approved baseline today": the design is most of the way there, the build is not there at all.
