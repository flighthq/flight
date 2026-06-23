# Maturation Roadmap: @flighthq/loader

**Current verdict:** stub — 18/100. A single 81-line file that fires every queued promise factory at once and emits three aggregate signals; it is a thin parallel-promise-runner, missing concurrency control, cancellation, retries, sequencing, and per-item correlation — almost the entire canonical loader surface.

The package's boundary is correct and worth preserving: `@flighthq/loader` is a **type-agnostic orchestrator** over `() => Promise<T>` thunks (or, going forward, item descriptors), while typed image/audio/font/atlas loading stays in `@flighthq/resources`. Maturation is about making the orchestration robust and complete, not about teaching the loader what an image is. Every type below lands in `@flighthq/types` first (the header layer), and each tier carries a matching obligation in the existing `crates/flighthq-loader` Rust crate.

## Bronze

The minimum viable, genuinely-useful batch loader. The defining feature of a batch loader is bounded concurrency; the current "fire everything" model actively gets this wrong. Bronze fixes that, makes the Package Map's "sequence or parallel" claim true, and gives callers a way to stop and correlate.

- **Item-descriptor input.** Define `ResourceLoadItem` in `@flighthq/types` (`{ key?: string; load: (signal: AbortSignal) => Promise<unknown>; weight?: number; priority?: number; retries?: number }`) and overload `queueResourceLoad(loader, item)` to accept either a bare thunk (back-compat sugar) or a descriptor. The thunk form wraps into a descriptor internally. This is the seam every later tier hangs off — land it first.
- **Concurrency limit.** Add `ResourceLoaderOptions` in `@flighthq/types` with `maxConcurrent: number` (default e.g. 6, `0`/`Infinity` = unbounded = today's behavior). `createResourceLoader(options?: Readonly<ResourceLoaderOptions>)` stores it; `startResourceLoad` drains a worker pool of at most `maxConcurrent` in-flight loads instead of launching all at once.
- **Sequential mode.** Honor `maxConcurrent: 1` as the serial path (ordered drain by insertion/priority), satisfying the Package Map's "sequence or parallel." No separate function — concurrency of 1 _is_ sequential.
- **Cancellation.** Thread an `AbortSignal` into every `item.load(signal)`. Add `cancelResourceLoad(loader): void` (or `abortResourceLoad`) that aborts in-flight loads, rejects pending item promises with a cancellation reason, and prevents un-started items from running. Emit a new `onCancel` signal.
- **Per-item handle / correlation.** Make `queueResourceLoad` return a `ResourceLoadHandle` (`{ key: string; promise: Promise<T> }`) instead of a bare floating promise, and stamp each item with a stable `key` (caller-supplied or auto-assigned). `onError` carries `(error: unknown, key: string)` so a failure says _which_ item failed. This removes the "floating promise the caller must `.catch`" wart called out in the review.
- **`disposeResourceLoader(loader): void`.** Detach all signal listeners (the loader holds signal registries) per the house `dispose*` rule. Currently absent.
- **Rust mirror.** Bring `crates/flighthq-loader` to the same surface: `ResourceLoadItem`, `ResourceLoaderOptions`, pooled-concurrency drain, `cancel_resource_load`, `ResourceLoadHandle`, `dispose_resource_loader`. Cancellation maps to a Rust cancel token rather than `AbortSignal`.

## Silver

Competitive with a good, well-regarded loader (think `p-queue` / PixiJS loader / Three.js `LoadingManager` territory). Adds the professional edge cases and the second interface a determinate progress bar needs.

- **Retries with backoff.** Honor `retries` per item plus a loader-level default; add a `RetryPolicy` type in `@flighthq/types` (`{ retries: number; backoff: 'none' | 'linear' | 'exponential'; baseDelayMs: number; maxDelayMs?: number }`). A failed load re-runs up to `retries` times before its promise rejects and `onError` fires for good. Respect the abort signal between attempts.
- **Error-policy choice.** Add `errorPolicy: 'continue' | 'fail-fast'` to `ResourceLoaderOptions`. `fail-fast` aborts remaining loads on the first hard failure. Surface an aggregated `ResourceLoadError[]` (or a `ResourceLoadResult` summary) on `onComplete` so callers see _all_ failures, not just per-item rejections.
- **Byte / weight-aware progress.** Add `onProgress` overload (or a richer payload) reporting weighted progress, not just `loaded/total` item counts. Per-item `weight` (Bronze descriptor) feeds a fractional ratio; expose `getResourceLoadProgress(loader): number` (0–1) as a pull-style accessor alongside the push signal. Optionally accept a per-item `onByteProgress` for loaders that report bytes (fetch streams), feeding sub-item progress.
- **Per-item lifecycle signals (opt-in group).** Add `enableResourceLoaderItemSignals(loader)` (the `enable*`-group pattern) that activates `onItemStart(key)`, `onItemComplete(key, value)`, `onItemError(key, error, attempt)` and `onItemRetry(key, attempt, delayMs)`. Off by default so the lean path stays lean and tree-shakable.
- **Timeout.** Per-item `timeoutMs` on the descriptor and a loader default; a load exceeding it is aborted (via its `AbortSignal`) and treated as a failure feeding the retry/error policy. Fixes the "a hung factory hangs `onComplete` forever" gap.
- **Priority ordering.** Honor the descriptor `priority` field when selecting the next item to dispatch from the pending pool (higher priority drains first), not just insertion order.
- **Deduplication.** When two queued items share a `key`, return the _same_ handle/promise and load once. Add a `dedupe: boolean` option (default on) so duplicate URLs collapse.
- **Reset / reuse.** `resetResourceLoader(loader): void` clears `items/loaded/started/total` and signal state so one loader can run successive batches instead of being single-shot.
- **Rust mirror + parity.** All of the above in `crates/flighthq-loader`, with conformance-suite coverage for the deterministic, GPU-free orchestration (ordering, retry counts, dedupe, weighted progress) — loader is an ideal early conformance target.

## Gold

Authoritative, AAA. Nothing a domain expert would find missing; exhaustive features, pause/resume, observability, full edge-case handling, docs, and 1:1 Rust parity.

- **Pause / resume.** `pauseResourceLoad(loader)` / `resumeResourceLoad(loader)`: stop dispatching new items while letting in-flight ones finish (or abort-and-requeue on resume, documented), with an `onPause`/`onResume` signal pair. Define the resume semantics explicitly (do not silently re-run completed items).
- **Live concurrency / priority retune.** `setResourceLoaderConcurrency(loader, n)` and `setResourceLoadPriority(loader, key, priority)` to retune a running batch — the feature that separates a real queue from a one-shot pool.
- **Streaming / incremental add.** Allow `queueResourceLoad` _after_ `start` when the loader is in an explicit "open" streaming mode (instead of throwing), so a loader can act as a long-lived queue. Keep the strict double-start throw for the default single-batch mode (programmer-error throw stays; misuse only).
- **Detailed result model.** A `ResourceLoadReport` on `onComplete`: per-key status (`'loaded' | 'failed' | 'cancelled' | 'skipped'`), attempt count, elapsed ms, and bytes. `getResourceLoadStatus(loader, key): ResourceLoadItemStatus` for pull-style inspection.
- **Bandwidth / rate shaping.** Optional `maxBytesPerSecond` token-bucket throttle and a hook for a caller-supplied scheduler, for environments that must not saturate a metered connection.
- **`*Kind` and group tagging.** Per-item `kind`/`group` string tags so progress and reports can be partitioned (e.g. "preload" vs "level 2 assets"), with `getResourceLoadProgress(loader, group?)`.
- **Performance.** Pool the internal `QueuedItem`/handle objects (`acquire*`/`release*` brackets) and avoid per-settle array scans for completion detection; keep hot-path drain allocation-free, matching the explicit-allocation rule.
- **Exhaustive tests.** Cancellation mid-flight, retry exhaustion, fail-fast aggregation, timeout vs slow success races, dedupe correctness, weighted vs count progress monotonicity, pause/resume re-entrancy, reset reuse, aliased/empty queues, and abort-signal propagation into `item.load`.
- **Docs + examples.** A loader example demonstrating bounded-concurrency preload of a `@flighthq/resources` batch with a determinate progress bar, retries, and cancellation — the verbose, explicit golden-path usage the house style favors.
- **1:1 Rust parity.** Full `crates/flighthq-loader` parity (pause/resume, retune, report model, throttle, pooling) with the divergence map recording any cancel-token / async-`Send` seam differences from the TS `AbortSignal` model.

## Sequencing & effort

Recommended order, with dependencies and items to surface:

1. **Types-first descriptor + options (small, blocking).** Add `ResourceLoadItem`, `ResourceLoaderOptions`, `ResourceLoadHandle`, and the richer `ResourceLoader` signal payloads to `@flighthq/types` before any implementation. Everything else hangs off the descriptor shape, so getting it right here avoids churn. This is the one design decision to lock early.
2. **Bronze, in order:** descriptor input → concurrency pool (and thereby sequential mode) → abort/cancel → per-item handle/key correlation → `disposeResourceLoader`. The pool drain is the largest single piece (~half a day); the rest are small. Mirror into `crates/flighthq-loader` as each lands.
3. **Silver:** retries+backoff and error-policy first (they share the per-attempt loop), then weighted progress + item signals, then timeout/priority/dedupe/reset. Item lifecycle signals must go through `enableResourceLoaderItemSignals` (the `enable*` group pattern) to stay tree-shakable. Medium effort overall.
4. **Gold:** pause/resume and live retune, then the report model, then throttle/pooling/perf, then exhaustive tests + example + Rust parity. Largest tier; pause/resume semantics need a deliberate spec.

**Cross-package / design items to surface (do not act on autonomously):**

- **Boundary confirmation with `@flighthq/resources`.** Confirm the loader stays type-agnostic and that typed conveniences (load-an-image-batch helpers) live in `resources`, consuming the loader. If a `resources`-side helper like `createImageResourceLoadItem(url)` is wanted, that is a `resources` change, not a `loader` one — raise it rather than reaching across.
- **`AbortSignal` in the type seam.** Threading `AbortSignal` through `ResourceLoadItem.load` puts a web/DOM type in `@flighthq/types`. Confirm this is acceptable, or define a Flight-neutral cancellation token in `@flighthq/types` that the web path maps to `AbortSignal` and the Rust port maps to a cancel token — this keeps the authoritative seam native-clean per the Rust-port async/`Send` guidance.
- **A `-formats` neighbor is _not_ applicable here.** The loader parses nothing; importer/parser concerns belong to `resources`/`spritesheet-formats`-style packages. No `loader-formats` package should be created.
