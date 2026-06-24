---
package: '@flighthq/loader'
status: solid
score: 80
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/loader.md
  - reviews/maturation/depth/loader.md
  - source
  - changes.patch
---

# Review: @flighthq/loader

## Verdict

**solid — 80/100.** What was an 18/100 thin parallel-promise-runner is now a genuine batch loader: bounded-concurrency worker-pool drain, cancellation, retries with backoff, fail-fast vs continue, timeout, priority, dedup, weight-aware and group-filtered progress, pause/resume, live retune, streaming mode, reset/reuse, and an opt-in per-item signal group — all over a clean type-agnostic `() => Promise<T>` seam with types defined `@flighthq/types`-first. The implementation (`67dc46d64:packages/loader/src/resourceLoader.ts`) is one 660-line file with 60 honest tests. The status doc's self-estimate is 92/100 (Gold); I land lower because the headline Gold feature — byte-progress / `bytes` reporting — is **dead code that can never produce a non-zero value**, the token-bucket throttle has a documented reentrancy hole, and two type docstrings advertise a `bytesHintDefault` option that does not exist. The orchestration core is real and well-tested; the byte/bandwidth tier on top of it is half-wired.

## Present capabilities

Grounded in `67dc46d64:packages/loader/src/resourceLoader.ts` and the seven type files under `67dc46d64:packages/types/src/ResourceLoad*.ts` / `ResourceLoader*.ts`:

- **Type-agnostic orchestrator, types-first.** `ResourceLoadItem`, `ResourceLoaderOptions`, `ResourceLoadHandle`, `ResourceLoadReport`, `ResourceLoadItemStatus`, `ResourceLoaderItemSignals`, and the enriched `ResourceLoader` signal entity all live in `@flighthq/types`. The package imports only `@flighthq/signals` and `@flighthq/types`. The boundary the maturation roadmap wanted preserved — loader knows nothing about images/audio/fonts — holds.
- **Bounded-concurrency drain.** `drainQueue` loops while `inFlight.size < maxConcurrent`; default 6, `0`/`Infinity` → unbounded. `maxConcurrent: 1` is the serial path (test "loads items sequentially when maxConcurrent is 1"), making the Package Map's "sequence or parallel" claim true.
- **Cancellation.** `cancelResourceLoad` aborts in-flight `AbortController`s, rejects pending items with a `DOMException('…','AbortError')`, records `'cancelled'` reports, emits `onCancel`, and completes immediately if nothing is running. `runEntry` races `entry.wrappedLoad(signal)` against `abortSignalPromise(signal)` so abort/timeout is honored even when a factory ignores the signal.
- **Retries with backoff.** Per-item `retries` (falls back to loader `retries`); `computeRetryDelay` supports `none`/`linear`/`exponential` clamped to `retryMaxDelayMs`. Abort/timeout errors are excluded from retry. Tests cover exhausted retries and retry-then-succeed.
- **Error policy.** `'continue'` (default) vs `'fail-fast'`; fail-fast calls `cancelRemainingEntries`, which records `'skipped'` reports for pending items. Both paths tested.
- **Timeout / priority / dedup.** Per-item `timeoutMs` aborts via a `TimeoutError`; `priority` sorts the pending pool at dispatch (`sortPendingByPriority`); `dedupe` (on by default, keyed) returns the same handle and loads once. All tested.
- **Progress.** `getResourceLoadProgress` is weight-aware (`weightLoaded/totalWeight`) and group-filterable; the push `onProgress(loaded,total)` fires per settle. Weighted-progress and group-filter tests pass.
- **Pause/resume + live retune.** `pauseResourceLoad`/`resumeResourceLoad` with `onPause`/`onResume`; `setResourceLoaderConcurrency` and `setResourceLoadPriority` retune a running batch.
- **Streaming + reset.** `streaming: true` lets `queueResourceLoad` dispatch after start instead of throwing; `resetResourceLoader` clears all state (and refills the token bucket) for batch reuse.
- **Opt-in item signals.** `enableResourceLoaderItemSignals` lazily allocates the `onItemStart/Complete/Error/Retry` group (the `enable*` pattern), off by default and tree-shakable.
- **`disposeResourceLoader`.** Disconnects all six loader signals plus the four item signals when enabled — correct use of the `dispose*` verb (GC-release, nothing to `destroy*`).
- **Internal pool.** `acquirePendingEntry`/`releasePendingEntry` bracket a module-scoped `PendingEntry[]` LIFO, clearing closure refs on release. Three-batch reuse and stale-ref tests pass.

## Gaps

The orchestration surface is near-complete for the domain; the gaps are concentrated in the byte/bandwidth tier and a few correctness edges, not in missing canonical features.

- **Byte-progress reporting is dead (correctness).** `report.bytes` reads `entry.bytesLoaded` (lines 510/533/578), but `entry.bytesLoaded` is set to `0` in `queueResourceLoad` and **never written again anywhere**. `entry.onBytesProgress` is stored from the descriptor (line 317) but the loader **never invokes it**, and no "tracking shim" exists. The comment at lines 490-493 explicitly claims `entry.onBytesProgress` "is a tracking shim (set up in queueResourceLoad) that also writes `entry.bytesLoaded`" — this is false; it is the raw descriptor callback. Net effect: `bytes` is `0` for every item, always. The status doc lists `ResourceLoadReport.bytes` / `ResourceLoadItem.onBytesProgress` as delivered Gold; in reality the wiring is absent and the three "bytes progress" tests only assert `bytes` is a number `>= 0` (i.e. they pass on the constant 0).
- **`bytesHintDefault` documented but unimplemented (docs/impl drift).** Both `ResourceLoaderOptions`' `maxBytesPerSecond` docstring and the status doc tell callers to "set `bytesHintDefault` to enforce throttling for all items," but `bytesHintDefault` is not a field on `ResourceLoaderOptions` and is read nowhere. An item with no `bytesHint` is permanently free through the throttle, with no way to change that — directly contradicting the documented escape hatch.
- **Token-bucket throttle is advisory, not a budget (concurrency).** Flagged honestly in status: multiple concurrent `drainQueue` invocations (one per settle) each `refillTokens` → check → `consumeTokens` with no serialization, so the byte budget can be overspent under concurrency. Acceptable for a soft throttle, but it is not the hard cap the name implies, and there is no test that the _rate_ is actually bounded (the one throttle test only checks the second item is delayed within 50 ms).
- **Fail-fast does not abort in-flight peers (semantics).** `cancelRemainingEntries` aborts only `pending` entries; other already-running loads continue to completion and are recorded as `'loaded'`/`'failed'` normally. The status doc and roadmap describe fail-fast as aborting "remaining loads"; a caller may reasonably expect in-flight siblings to be cancelled too. The chosen semantics are defensible but undocumented in the type and untested for the in-flight case.
- **No aggregated error surface.** The roadmap's Silver item asked for an aggregated `ResourceLoadError[]` / summary on `onComplete`. `onComplete` carries the full `reports[]` (status per key), which is arguably sufficient, but there is no first-class "here are all the failures" accessor; a caller must filter `reports` by `status === 'failed'` themselves.
- **No example in the gallery.** The `batchloading` example referenced in the status doc is **not present in this bundle's `packages/`/`examples/` delta** (the patch touches only `loader/src`, `loader/dist`, and the seven `types` files). Either it did not land in this import or it lives outside the captured tree; the Gold "docs + examples" obligation is unverifiable here and, on the evidence, absent.
- **No Rust crate.** `flighthq-loader` (charter `crate:` field) is not in this bundle. The deterministic, GPU-free orchestration is the ideal early conformance target the roadmap names; still entirely TS-only.

## Charter contradictions

The charter (`packages/loader/charter.md`) is a stub — `What it is` is seeded from the depth review; `North star`, `Boundaries`, `Decisions`, and `Open directions` are all `TODO`. There is therefore no blessed principle to contradict. The one substantive line — "batch queue for loading multiple resources in sequence or parallel" — is now **satisfied** (sequential mode via `maxConcurrent: 1`), which was the one prior charter-vs-code contradiction the depth review raised. Net: **no charter contradictions**, because the charter does not yet say enough to contradict. Every assumption I made to review is logged under candidate open directions below.

## Contract & docs fit

**Lives up to the contract:**

- **Types-first, single root export, side-effect-free.** All shared types in `@flighthq/types`; `index.ts` is a one-line barrel; `"sideEffects": false`; no module-top-level registration or listeners (the pool array is internal mutable state, not public API surface).
- **Full unabbreviated names, free functions.** `createResourceLoader`, `queueResourceLoad`, `cancelResourceLoad`, `getResourceLoadProgress`, etc. — each carries the full `ResourceLoad(er)` type word and is globally self-identifying. No methods.
- **Verbs.** `dispose*` used correctly (GC-release); `acquire*`/`release*` used as paired brackets for the internal pool; `enable*` for the opt-in signal group; `reset*`/`set*`/`get*` all idiomatic.
- **Signals vs callbacks.** Multi-listener public notification goes through `@flighthq/signals` (`onComplete`, `onError`, per-item group); the internal per-attempt wiring uses direct calls. Matches the house rule.
- **Tests colocated, alphabetized, mirror exports.** `resourceLoader.test.ts` `describe` blocks are alphabetized and named per exported function/topic; one test file per source file.

**Sentinel rule — partial.** `getResourceLoadItemStatus(loader, key)` returns `'pending'` for an **unknown** key (line 241), conflating "queued, not started" with "no such item." The contract wants a sentinel for an expected-failure lookup; there is no `'unknown'` member of `ResourceLoadItemStatus` and no `null` return, so a typo'd key silently reads as `'pending'` forever. Candidate revision: add an `'unknown'`/`'missing'` status or return `null` for an unrecognized key.

**Candidate doc revisions (not acted on):**

- The `bytesHintDefault` references in `ResourceLoaderOptions.ts` and the status doc describe a non-existent option — either implement it or strike the docstrings.
- The lines 490-493 comment in `resourceLoader.ts` describes a tracking shim that does not exist; it should be corrected or removed alongside fixing/removing the bytes feature.
- The Package Map line for `@flighthq/loader` ("batch queue for loading multiple resources in sequence or parallel") is now an **understatement** of a fairly complete loader; fine as a one-liner, but the package has clearly outgrown "queue."

## Candidate open directions

The charter is a stub, so these are the questions I had to assume past — each is a candidate Open direction for the charter:

- **`AbortSignal` / `DOMException` in the type seam (raised by the worker).** `ResourceLoadItem.load` takes a web/DOM `AbortSignal`, and cancellation/timeout use `DOMException`. Should `@flighthq/types` define a Flight-neutral `CancellationToken` (web → `AbortSignal`, Rust → cancel token) per the Rust-port async/`Send` guidance, or is the DOM type the accepted seam? This is a `types`-level decision that blocks the Rust mirror — surfaced, not assumed.
- **First-class byte tracking vs. removal.** The bytes/`onBytesProgress`/`bytesHint`/`maxBytesPerSecond` tier is currently non-functional. The fork is: (a) finish it — extend `load` to `(signal, ctx)` so the loader injects a `reportBytes` that writes `entry.bytesLoaded` (a source-breaking factory-signature change), or (b) cut the dead surface until it can be done right. Either way the throttle's "advisory, not a budget" semantics need a blessed stance.
- **Fail-fast scope.** Does `'fail-fast'` mean "stop dispatching new work" (current behavior) or "abort in-flight peers too"? Needs a decision and a test pinning it.
- **Boundary with `@flighthq/resources` (per the roadmap).** Confirm the loader stays type-agnostic and that typed conveniences (`createImageResourceLoadItem(url)`, etc.) live in `resources`, consuming the loader. The status doc already parks these there; the charter should bless that boundary as a non-goal.
- **Structural forks.** Fork A (source-data vs graph participation) and the triad do not bite here — a loader holds no graph node and parses nothing, so per the roadmap **no `loader-formats` neighbor should exist**. Fork F (thin-by-design vs under-built): loader has moved firmly out of the "under-built stub" column and into "solid"; the charter should record that it is no longer a stub to push on.
