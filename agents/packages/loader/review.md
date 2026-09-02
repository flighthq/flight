---
package: '@flighthq/loader'
status: solid
score: 74
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - assessment.md
  - source
---

# loader — Review

## Verdict

solid -- 74/100. The loader is a well-shaped, functional batch orchestrator with clean naming, honest progress reporting, and thorough test coverage. Its core loop -- queue, drain, settle -- works correctly under concurrency limits, cancellation, fail-fast, pause/resume, reset, retry, timeout, streaming, deduplication, priority, and byte progress reporting. The score reflects several known defects that the charter and status already flag (group progress currency mismatch, unknown-key sentinel, absent diagnostics layer, web-type portability), plus the still-undone monolith decomposition, and the lack of any example or functional scene exercising the API end-to-end.

## Present capabilities

All implementation lives in a single source file (`packages/loader/src/resourceLoader.ts`, 790 lines) with a single colocated test file (1462 lines, 88 tests, all passing).

**Core orchestration:**
- `createResourceLoader(options?)` -- creates a loader with configurable concurrency, error policy, retry, streaming, dedup, and bandwidth throttle. Returns a `ResourceLoader` (not Entity-based).
- `queueResourceLoad(loader, item | thunk)` -- accepts a `ResourceLoadItem<T>` descriptor or a bare `() => Promise<T>` thunk. Returns a typed `ResourceLoadHandle<T>` with `key` and `promise`. Auto-assigns keys when none provided.
- `startResourceLoad(loader)` -- begins draining the queue. Emits `onComplete` immediately for an empty batch.
- `cancelResourceLoad(loader)` -- aborts in-flight loads via `AbortController`, rejects all queued handles, emits `onCancel`. Correctly handles cancel-before-start (charter Decision 2026-07-30).
- `resetResourceLoader(loader)` -- bumps a generation counter to orphan in-flight loads; clears all state for reuse. Generation-stamping prevents phantom settlements against the next batch (charter Decision 2026-07-30).
- `pauseResourceLoad(loader)` / `resumeResourceLoad(loader)` -- pause/resume dispatch.
- `disposeResourceLoader(loader)` -- clears all signal listeners; correctly uses `dispose*` verb (detach for GC, no non-GC resource to free).
- `setResourceLoaderConcurrency(loader, n)` -- live concurrency retuning; triggers drain if slots opened.
- `setResourceLoadPriority(loader, key, priority)` -- updates a pending item's priority before dispatch.

**Progress and reporting:**
- `getResourceLoadProgress(loader, group?)` -- single 0..1 weighted fraction; the same number `onProgress` emits.
- `getResourceLoadCounts(loader)` -- `ResourceLoadCounts` with `settledItems`, `inFlightItems`, `queuedItems`, `totalItems`.
- `getResourceLoadBytes(loader)` -- `ResourceLoadBytes` with `bytesLoaded`, `bytesTotalKnown`, `itemsWithKnownBytes`.
- Per-item byte progress via `reportBytes` second argument to the factory (`resourceLoader.ts:575-578`), attempt-scoped to prevent stale reports from writing into recycled pool entries.

**Signals:**
- Loader-level: `onCancel`, `onComplete`, `onError`, `onPause`, `onProgress`, `onResume`.
- Item-level (opt-in via `enableResourceLoaderItemSignals`): `onItemStart`, `onItemComplete`, `onItemError`, `onItemRetry`.

**Error handling:**
- `errorPolicy: 'continue' | 'fail-fast'`. Continue keeps loading after failures; fail-fast skips remaining pending items (in-flight peers finish).
- Retry with configurable backoff (`none`, `linear`, `exponential`), base delay, max delay, and per-item retry count.
- Timeout via per-item `timeoutMs` with `AbortController`-based enforcement.

**Other features:**
- Deduplication by key (on by default, configurable via `dedupe: false`).
- Streaming mode (`streaming: true`) allows queueing after start.
- Priority-based dispatch (higher priority dispatched first, `sortPendingByPriority`).
- Token-bucket bandwidth throttle gated on `bytesHint` per item.
- `PendingEntry` object pool with acquire/release cycle to reduce allocation pressure.

**Packaging:**
- Two-lane exports: `index.ts` (public, re-exports 15 functions from `contract.ts`) and `contract.ts` (re-exports `resourceLoader.ts`).
- `sideEffects: false`. No top-level side effects.
- Dependencies: `@flighthq/signals`, `@flighthq/types` only.
- All types in `@flighthq/types`: `ResourceLoader`, `ResourceLoaderOptions`, `ResourceLoaderItemSignals`, `ResourceLoadItem`, `ResourceLoadHandle`, `ResourceLoadReport`, `ResourceLoadItemStatus`, `ResourceLoadCounts`, `ResourceLoadBytes`, `ResourceLoadBytesReporter`.

**Test coverage:**
88 tests across 16 `describe` blocks, alphabetized and mirroring exports. Coverage includes: bandwidth throttle (dispatch gating, reset, free items), byte progress (reporter handoff, late-report guard, pool-recycle hazard, one-argument factory compatibility), cancel (before-start, in-flight, idempotent, report status), create, dispose (with and without item signals), enable item signals, error policy (continue, fail-fast with in-flight peers), bytes progress (report field, callback), item status, progress (before start, empty, fractional, group), pause, pool (reuse across batches, no stale refs), queue (thunk, descriptor, handle, auto-key, post-start throw, dedup, parallel, sequential, concurrency limit, progress events, weighted progress), reset (reuse, progress tracking, orphan prevention), resume, retries (exhaust, succeed on retry), concurrency retuning, priority, start (empty, idempotent, streaming), timeout, weight-aware progress (across outcomes: failure, fail-fast, cancel).

## Gaps

1. **Group progress uses item fraction, not weighted fraction.** `getResourceLoadProgress(loader, group)` at `resourceLoader.ts:326` returns `groupReports.length / groupTotal` -- a count-based fraction -- while the ungrouped path at `:334` returns `weightLoaded / totalWeight`. In a weighted batch the same question ("how far along?") gets two different answers depending on whether a group name is passed. Status.md flags this.

2. **Unknown-key sentinel.** `getResourceLoadItemStatus(loader, key)` falls through to `'pending'` at `resourceLoader.ts:299` for a key that was never queued, making it indistinguishable from a genuinely queued item. The contract calls for `null` or a distinct sentinel for expected-failure lookups. Charter Open direction #4; status.md flags this.

3. **No diagnostics layer.** No `enableResourceLoaderGuards` or `explain*` module exists. The queue-after-start throw at `resourceLoader.ts:354-356` is a hard throw with no guard-layer warning seam, and the unknown-key sentinel from gap #2 has no `explainResourceLoadItemStatus` query. The diagnostics convention requires: core exposes seams, caller-facing warnings live in shakeable guard modules emitting through `@flighthq/log`.

4. **Still a single-file monolith.** At 790 lines, `resourceLoader.ts` bundles the token-bucket rate limiter, the drain loop, the PendingEntry pool, retry/backoff computation, priority sort, progress accumulation, signal wiring, and all 15 exports. The token bucket is an extractable bedrock primitive (not loader-specific). Charter Decision 2026-07-02 calls for decomposition; charter Open direction #2 asks for the plan.

5. **No example or functional scene.** No entry in `examples/packages/` or `functional/scenes/` imports `@flighthq/loader`. The only consumers are `packages/assets/src/assetLibrary.ts` (uses counts, not progress) and `packages/scene3d-resources/src/` (queues loads). The progress, byte-reporting, pause/resume, priority, streaming, and throttle surfaces have no end-to-end demonstration. Status.md flags this.

6. **`sortPendingByPriority` re-sorts the full pending array on every dispatch.** At `resourceLoader.ts:511`, inside the `drainQueue` while-loop, `sortPendingByPriority(internal.pending)` runs on each iteration. For batches with many items this is O(n log n) per dispatch. A sorted insert or a heap would be O(log n).

7. **Token-bucket race under concurrent drains.** The assessment (2026-07-30) documented this as "not a correctness break": two drains parked in `delay` can both wake, both read `tokenBucketDelayMs` as 0, and both `consumeTokens`, transiently overdrawing the byte budget by one entry. The concurrency bound holds; the rate bound is briefly exceeded. Documented but not fixed.

8. **`PendingEntry` pool is module-scoped with no cap.** `pendingEntryPool` at `resourceLoader.ts:41` is a single unbounded LIFO stack shared by every loader instance in the process. `releasePendingEntry` clears references to prevent GC leaks, so cross-instance aliasing is safe, but the pool grows monotonically under burst loads with no ceiling and no per-loader isolation.

9. **Web-specific types on the portable seam.** `AbortSignal` appears in `ResourceLoadItem.load`'s signature (`packages/types/src/ResourceLoadItem.ts:8`), and cancel/timeout errors are constructed as `DOMException` (`resourceLoader.ts:147, 584, 753`). `AbortSignal`/`AbortController` are available in Node.js but `DOMException` is a web-origin type. Charter Decision 2026-07-02 accepts `AbortSignal` as the TS cancellation primitive, deferring Rust's own token to parity passes; but `DOMException` is not addressed and is harder to port.

10. **`ResourceLoader` is not Entity-based.** `createResourceLoader` returns a plain `ResourceLoaderInternal` cast to `ResourceLoader`. The codebase map states "Entity is the base type for every SDK object -- `create*` always returns Entity." The loader does not participate in entity identity.

11. **Fail policy is missing its third mode.** `errorPolicy` accepts `'continue' | 'fail-fast'` but charter Decision 2026-07-02 and Open direction #1 describe a third case: stop dispatching new items but let in-flight finish without aborting. Assessment backlog acknowledges this.

12. **No caller-facing `AbortSignal` integration.** Internally every entry carries its own `AbortController`, but there is no way for a caller to supply an external `AbortSignal` to wire into the loader's lifecycle. Assessment backlog acknowledges this.

## Charter contradictions

1. **North star #2 ("Honest features only") -- group progress.** The group path of `getResourceLoadProgress` returns an unweighted item fraction while the ungrouped path returns the weighted fraction. For a weighted batch, the group path silently ignores the caller's declared weights. This is the same "two answers to one question" defect the charter's 2026-07-30 decision fixed for the batch-level path, surviving on the group path. Status.md calls it out; the code has not been corrected.

2. **North star #3 ("Canonical batch-loader completeness") -- partial.** Bounded concurrency, cancellation, priority, progress, pause/resume, reset/reuse, byte progress, fail-fast, and retry are all built. The missing canonical pieces are: caller-supplied `AbortSignal`, the stop-dispatch fail-policy mode, and a guard/diagnostics layer. The package is not yet at full table-stakes completeness.

No contradiction with North star #1 ("Type-agnostic to the bone") -- the loader knows nothing about what it loads. No boundary violations.

## Contract and docs fit

**(a) Package against the contract:**

- **Types-first:** All exported types live in `@flighthq/types`. Ten type files cover the full surface. Pass.
- **Full unabbreviated names:** `cancelResourceLoad`, `getResourceLoadProgress`, `setResourceLoaderConcurrency`, `enableResourceLoaderItemSignals` -- all include the full type name. Pass.
- **Sentinels not throws:** `getResourceLoadItemStatus` returns `'pending'` for unknown keys -- an in-band value, not a sentinel. The queue-after-start check at `:354` throws, which is correct (programmer error / precondition violation). The unknown-key case is the miss.
- **`sideEffects: false`:** Correct. The module-scoped `pendingEntryPool` is lazily populated, not an eager side effect.
- **Two-lane exports:** `.` and `./contract` both present. `index.ts` re-exports from `contract.ts`. Compliant.
- **`dispose*` vs `destroy*`:** `disposeResourceLoader` is correct -- it detaches signal listeners for GC eligibility; no non-GC resource to destroy.
- **`enable*` signal opt-in:** `enableResourceLoaderItemSignals` matches the pattern. Item signals are off by default.
- **No import from `@flighthq/sdk`:** Correct.
- **Entity base type:** Not used. `createResourceLoader` returns a plain object, not an Entity. This is a contract deviation the charter does not address.
- **`Readonly<T>`:** `options` is stored as `Readonly<ResourceLoaderOptions>` (`:130`). `queueResourceLoad` takes `Readonly<ResourceLoadItem<T>>` (`:349`). `_isOrphaned` uses `Readonly<PendingEntry>` and `Readonly<ResourceLoaderInternal>` (`:730`). Generally applied. The `ResourceLoader` parameter on most functions is not marked `Readonly`; acceptable since callers pass mutable loaders.
- **Out-parameter safety:** Not applicable -- the package has no out-parameter functions.
- **Imports use `/contract`:** Internal signals import is `@flighthq/signals/contract` (`:1`); types import is `@flighthq/types/contract` (`:2`). Pass.

**(b) Contract/docs against the package:**

- **Package Map entry:** The codebase map lists `loader` in the Resources domain. Accurate.
- **Charter front matter:** `package`, `role`, `crate`, `lastDirection`, `review`, `assessment`, `status` all present and conformant.
- **Assessment staleness:** The assessment is from 2026-07-30; the status is from 2026-08-08. The assessment's "Recommended: None open" holds given what has changed since, but it does not address the group-progress defect that status.md flags. A re-assessment would produce new recommended items from the gaps above.

## Candidate open directions

These are questions the charter does not answer that this review had to assume:

1. **Should `ResourceLoader` be Entity-based?** The codebase map says `create*` always returns Entity. The loader currently returns a plain object. If Entity is the universal base, the loader should participate; if the loader is an exception (it is a scheduling primitive, not a scene-graph object), the charter should say so.

2. **Should the `PendingEntry` pool be per-loader or global?** The current module-scoped pool is a latent cross-instance concern. For a C/C++ port, a global mutable pool is a thread-safety hazard. The charter does not address pool ownership.

3. **What is the portability stance on `DOMException`?** Charter Decision 2026-07-02 addresses `AbortSignal` but not `DOMException`. The cancellation/timeout errors are `new DOMException(...)` which is web-origin. A neutral error type or a sentinel-based approach would be more portable.
