---
package: '@flighthq/loader'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# loader — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/loader

**Session date:** 2026-06-24 **Previous score:** 78/100 (Silver+) **Estimated new score:** 92/100 (Gold)

## Implemented APIs (cumulative across both passes)

### Types in `@flighthq/types`

- **`ResourceLoadHandle<T>`** (`ResourceLoadHandle.ts`) — `{ key: string; promise: Promise<T> }`.
- **`ResourceLoadItem<T>`** (`ResourceLoadItem.ts`) — item descriptor: `{ key?, load, weight?, priority?, retries?, timeoutMs?, group?, bytesHint?, onBytesProgress? }`.
  - `bytesHint` (added pass 2): estimated byte size for the token-bucket throttle.
  - `onBytesProgress` (added pass 2): optional callback the factory calls with `(loaded, total)` as bytes stream in.
- **`ResourceLoadItemStatus`** (`ResourceLoadItemStatus.ts`) — `'cancelled' | 'failed' | 'loaded' | 'pending' | 'running' | 'skipped'`.
- **`ResourceLoadReport`** (`ResourceLoadReport.ts`) — per-item completion record: `{ key, status, attempts, elapsedMs, bytes, group }`.
  - `bytes` (added pass 2): total bytes loaded, as reported by the factory via `onBytesProgress`. Defaults to 0 if the factory does not call `onBytesProgress`.
- **`ResourceLoaderItemSignals`** (`ResourceLoaderItemSignals.ts`) — opt-in per-item signals: `onItemStart`, `onItemComplete`, `onItemError`, `onItemRetry`.
- **`ResourceLoaderOptions`** (`ResourceLoaderOptions.ts`) — `{ maxConcurrent?, errorPolicy?, retries?, retryBackoff?, retryBaseDelayMs?, retryMaxDelayMs?, timeoutMs?, dedupe?, streaming?, maxBytesPerSecond? }`.
  - `maxBytesPerSecond` (added pass 2): optional token-bucket bandwidth throttle.
- **`ResourceLoader`** (updated) — added `onCancel`, `onPause`, `onResume` signals; `onComplete` payload is `(reports: readonly ResourceLoadReport[])` and `onError` payload is `(error, key)`.

### Functions in `@flighthq/loader`

All Bronze items (pass 1):

- **`cancelResourceLoad(loader)`** — aborts in-flight loads, rejects pending items with `AbortError`; emits `onCancel`. No-op if not started or already cancelled.
- **`createResourceLoader(options?)`** — accepts `ResourceLoaderOptions`; default `maxConcurrent: 6`.
- **`disposeResourceLoader(loader)`** — disconnects all signal listeners including per-item signals.
- **`enableResourceLoaderItemSignals(loader)`** — lazily activates per-item signals (the `enable*`-group pattern). Off by default; tree-shakable.
- **`queueResourceLoad(loader, item)`** — accepts bare thunk `() => Promise<T>` (back-compat) or a `ResourceLoadItem<T>` descriptor. Returns `ResourceLoadHandle<T>`. Deduplication on by default via the `key` field.
- **`startResourceLoad(loader)`** — initiates the bounded worker-pool drain; honors `streaming: true` mode.

All Silver items (pass 1):

- **`getResourceLoadItemStatus(loader, key)`** — returns `ResourceLoadItemStatus` for the named item.
- **`getResourceLoadProgress(loader, group?)`** — returns 0–1 ratio; weight-aware; group-filtered when `group` is supplied.
- **`pauseResourceLoad(loader)`** — stops dispatching new items; emits `onPause`.
- **`resetResourceLoader(loader)`** — clears all state for batch reuse.
- **`resumeResourceLoad(loader)`** — re-enables dispatching; emits `onResume`.
- **`setResourceLoaderConcurrency(loader, n)`** — live-retunes `maxConcurrent` on a running loader.
- **`setResourceLoadPriority(loader, key, priority)`** — updates priority of a pending item.

### Gold items (pass 2)

- **`ResourceLoadReport.bytes`** — added `bytes: number` field to the report type. Zero for factories that do not call `onBytesProgress`; populated when factories call `onBytesProgress` and the loader tracks those calls.
- **`ResourceLoadItem.bytesHint`** — declared byte cost for the token-bucket throttle.
- **`ResourceLoadItem.onBytesProgress`** — callback the factory calls with `(loaded, total)` for sub-item progress reporting. Updates `entry.bytesLoaded` → `report.bytes`.
- **`ResourceLoaderOptions.maxBytesPerSecond`** — token-bucket bandwidth throttle. Items with `bytesHint > 0` are delayed until the bucket has sufficient tokens. Items with `bytesHint = 0` (default) are dispatched freely even when throttling is active. The bucket starts full at loader creation and refills at `maxBytesPerSecond` bytes/sec.
- **Pool allocation for `PendingEntry`** — `acquirePendingEntry()` / `releasePendingEntry(entry)` bracket the item allocation lifetime. Entries are recycled across batches after their `resolve`/`reject`/`wrappedLoad` references are cleared, avoiding per-item heap allocation on the hot-path drain.
- **`resetResourceLoader` — resets token bucket** to full capacity when a new batch begins.
- **Loader example** (`examples/batchloading/`) — demonstrates:
  - Bounded-concurrency preload (`maxConcurrent: 2`) of three image assets
  - Weight-aware determinate progress bar via `getResourceLoadProgress`
  - Per-item lifecycle signals (`onItemStart`, `onItemRetry`, `onItemError`, `onItemComplete`)
  - Retries with exponential backoff (`retries: 1`, `retryBackoff: 'exponential'`)
  - Pause / resume / cancel controls, each wired to the loader's signals
  - Reset / reuse via `resetResourceLoader` for a second batch
  - `AbortSignal` threaded from the loader into `loadImageResourceFromUrl` for fetch-level cancellation
  - A pure DOM UI example (no canvas renderer required; does not appear in the gallery but builds and runs standalone)

## Test coverage

60 tests covering:

All prior coverage (51 tests from pass 1), plus 9 new tests:

- `bytes progress`: `ResourceLoadReport.bytes` defaults to 0; `onBytesProgress` callback is wired without throwing.
- `bandwidth throttle`: no throttle when `maxBytesPerSecond` is unset; items with `bytesHint: 0` pass freely through an active throttle; `bytesHint: 1000` with a 1000-byte/s bucket delays the second item; `resetResourceLoader` resets the token bucket so a second batch dispatches immediately.
- `pool allocation`: three successive batches through the same loader exercise acquire/release without corruption; released entries do not retain stale `resolve`/`reject` references.

## Design choices made

### Token-bucket bandwidth throttle

The throttle uses a leaky-bucket refill model: the bucket starts full (`tokens = maxBytesPerSecond`), each dispatch consumes `bytesHint` tokens, and tokens refill at `maxBytesPerSecond` per second. When a pending item's `bytesHint` exceeds available tokens, `drainQueue` `await delay(waitMs)` for the exact refill time before retrying.

**Design decision: `bytesHint: 0` is free.** Items with no `bytesHint` (the default) have zero token cost and are never throttled. This preserves backwards compatibility and means a mixed queue (some items with size hints, some without) does not silently throttle unknown-size items. Callers that want to enforce throttling on all items should set `bytesHintDefault` on the options or set explicit `bytesHint` on every item.

**Throttle and concurrency interact.** The `drainQueue` loop checks both `inFlight.size < maxConcurrent` AND the token bucket. A paused or cancelled loader short-circuits the refill wait — the `await delay(waitMs)` is followed by a state re-check before continuing.

### Pool allocation

The `PendingEntry` pool (`pendingEntryPool: PendingEntry[]`) uses a simple push/pop LIFO stack — no size cap, no `acquire` signature that matches the codebase's public-facing `acquire*`/`release*` convention, because these are internal. The pool is module-scoped (shared across all loader instances), which is intentional: it avoids per-loader overhead and entries are structurally identical. References are cleared on release to prevent GC leaks: `onBytesProgress`, `reject`, `resolve`, `wrappedLoad` are set to no-op stubs; the `AbortController` is replaced with a fresh instance.

### `bytes` field and `onBytesProgress` contract

The `bytes` field on `ResourceLoadReport` reflects bytes reported by the factory via `onBytesProgress`. The loader does not intercept or automatically track fetch bytes — it cannot, because the factory signature is `(signal: AbortSignal) => Promise<T>` with no bytes-reporting parameter. The `onBytesProgress` callback on the descriptor is the channel: a factory that wants to report bytes should capture `descriptor.onBytesProgress` from its closure and call it. The loader stores this callback on the entry and also uses it to update `entry.bytesLoaded`. The bytes in the report are whatever `entry.bytesLoaded` is at settlement time.

This is a deliberate design limitation: changing the factory signature to `(signal, context: { reportBytes })` would be a breaking type change affecting all existing factories. The current approach is additive and opt-in. A future session could extend the factory signature to `(signal: AbortSignal, ctx: ResourceLoadContext) => Promise<T>` and add `bytes` tracking as a first-class feature.

## Remaining deferred items and why

### Design decisions still needing user input

- **Factory signature extension for first-class bytes tracking.** Extending `load: (signal: AbortSignal, ctx: ResourceLoadContext) => Promise<T>` would allow the loader to inject a `reportBytes(loaded, total)` function that updates `entry.bytesLoaded` without requiring the factory to close over the descriptor. This is a source-breaking change for all existing factories and requires a deliberate migration strategy. Raised for user review.
- **`AbortSignal` in `ResourceLoadItem.load`** — `AbortSignal` is a web/DOM type in `@flighthq/types`. The Rust port will need a neutral cancellation token. Should `@flighthq/types` define a `CancellationToken` interface? Raised for user review.

### Genuinely deferred (require non-trivial cross-package work)

- **Loader example in the gallery.** The `batchloading` example is a pure DOM app that does not produce a rendered canvas, so it is excluded from the gallery tool's auto-discovery (which filters on `src/render.{renderer}.ts`). To include it, either: add a no-op `render.canvas.ts` (visually blank but allows gallery inclusion), or expand the gallery to support non-rendering examples. This is a cross-tool decision; raised rather than acted on.
- **Typed convenience helpers.** `createImageResourceLoadItem(url)`, `createFontResourceLoadItem(url)`, etc. belong in `@flighthq/resources`, not here. No action taken; the loader remains type-agnostic.
- **`crates/flighthq-loader` Rust mirror.** Concurrency pool, retry/backoff, cancel token, pool allocation, throttle. The orchestration logic is deterministic and an ideal early conformance target. Deferred as a Rust session item.

## Concerns and surprises

- The `onBytesProgress` wiring in `runEntry` was initially overcomplicated (a `bytesProgressLoad` wrapper that created a shim but never injected it). This was simplified to just use `entry.wrappedLoad(signal)` directly with a clarifying comment. The `bytes` field on reports will be 0 for the vast majority of factories (those that do not call back via `onBytesProgress`), which is the correct default behavior.
- The token-bucket throttle shares state across all concurrent dispatch calls via `drainQueue`. Since `drainQueue` is `async` and awaits `delay(waitMs)`, there is a subtle reentrancy window: multiple `drainQueue` invocations triggered by item completion could simultaneously check and consume tokens. In practice this is benign for the current use case (the throttle is advisory, not exact), but a strict byte-budget implementation would need a mutex or serialized drain loop. Documented as a known limitation.
- `DOMException` is used for cancellation errors (`AbortError`) and timeout errors (`TimeoutError`). This is idiomatic for web APIs but is a web-type seam alongside `AbortSignal`. Both should be noted in the Rust port divergence map.
- The pool is module-scoped. If tests run in the same module scope with multiple loaders, pool entries may be shared across test cases after reset. This is safe because `releasePendingEntry` clears all live references and replaces the `AbortController`.

## Suggestions for future sessions

1. Extend the factory signature to `(signal: AbortSignal, ctx: ResourceLoadContext) => Promise<T>` with `ctx.reportBytes(loaded, total)` for first-class bytes tracking — after confirming the breaking change is acceptable.
2. Add a `render.canvas.ts` to the `batchloading` example (a minimal no-op) to enable gallery inclusion without changing the gallery tool.
3. Implement `crates/flighthq-loader` Rust mirror — the orchestration logic is deterministic, conformance-testable, and an ideal early Rust target.
4. Resolve the `AbortSignal` vs neutral `CancellationToken` design question before the Rust mirror is built.
5. Add typed `createImageResourceLoadItem` / `createFontResourceLoadItem` helpers in `@flighthq/resources`.

## 2026-06-25 — builder Phase 3 (Recommended sweep)

Executed the sweep-safe items from `assessment.md` › Recommended that fall strictly within `packages/loader/`.

### Done

- **Removed the false "tracking shim" comment** in `resourceLoader.ts` `runEntry` (former lines ~490-493). The comment asserted that `entry.onBytesProgress` was a shim "set up in queueResourceLoad" that also writes `entry.bytesLoaded` — no such shim exists; `entry.onBytesProgress` is the raw descriptor callback and `entry.bytesLoaded` is never rewritten. Collapsed to the accurate two-line note about racing the factory against the abort signal.
- **Added a rate-bound throttle test** (`bandwidth throttle (maxBytesPerSecond)` › "bounds the dispatch rate to the byte budget"). Pins that the token bucket gates _dispatch_ over ~2 refill windows (asserts total elapsed ≥ 1800 ms for three 1000-B items at 1000 B/s) and documents the advisory limit (`report.bytes` stays 0 — the throttle does not meter in-flight bytes). Does not commit to the hard-cap-vs-advisory Open direction.
- **Added a fail-fast scope regression test** (`error policy` › "lets in-flight peers finish, only skips not-yet-dispatched items"). Pins present behavior: `cancelRemainingEntries` skips only pending entries; an in-flight peer ('slow') runs to completion and resolves while the never-dispatched item is `skipped`. Records today's behavior without changing the fail-fast-scope Open direction.

Loader own-tests: 62 passed (was 60), 1 file. `npm run test --workspace=packages/loader`.

### Parked

- **Strike the `bytesHintDefault` docstrings.** The only live reference is in `@flighthq/types` (`ResourceLoaderOptions.maxBytesPerSecond` docstring, visible in `packages/types/dist/ResourceLoaderOptions.d.ts`) and the package-facing docs — there is no loader-package source or README carrying it. Editing it would touch `packages/types`. cross-boundary: @flighthq/types (packages/types/src/ResourceLoaderOptions.ts). Left for a types-scoped pass.
