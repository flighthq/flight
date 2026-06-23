# Depth Review: @flighthq/loader

**Domain:** Batch / asset loading orchestration — queuing multiple async resource loads and reporting aggregate progress, completion, and errors. The Package Map scopes it as "batch queue for loading multiple resources in sequence or parallel."

**Verdict:** stub — 18/100

The entire package is one 81-line file exposing three functions (`createResourceLoader`, `queueResourceLoad`, `startResourceLoad`) over a 3-signal entity (`onComplete`, `onError`, `onProgress`). It can queue a set of promise factories, fire them all at once, and emit progress as they settle. That is the minimal viable core of a batch loader and nothing more. Against the canonical feature set of a mature loader library (concurrency control, sequencing, retries, cancellation, priority, pause/resume, timeout, dedup, per-item events), almost everything is absent. It is a functional proof-of-concept, not an authoritative library.

## Present capabilities

- **Entity/runtime split, idiomatic.** `createResourceLoader` returns a public `ResourceLoader` (three signals, defined in `@flighthq/types`); `ResourceLoaderInternal` carries `items`, `loaded`, `started`, `total`. Clean, tree-shakable, side-effect-free, free-function style.
- **Queue then start.** `queueResourceLoad(loader, factory)` registers a `() => Promise<T>` and returns a `Promise<T>` for that item; `startResourceLoad(loader)` kicks the batch. The per-item promise plus aggregate signals is a reasonable dual interface.
- **Parallel execution.** `startResourceLoad` launches every queued factory immediately (`for … void runQueuedItem`). The "loads items in parallel" test confirms it.
- **Aggregate progress.** `onProgress(loaded, total)` fires after each item settles; `total` is frozen at start.
- **Completion + continue-on-error.** `onComplete` fires once all items settle; a failing item rejects its own promise and emits `onError` but does **not** abort the batch (the `finally` always advances `loaded`). Continue-on-error is the only error policy, hardcoded.
- **Empty-queue and double-start guards.** Empty queue emits `onProgress(0,0)` + `onComplete` synchronously; second `startResourceLoad` is a no-op; queuing after start throws (programmer-error throw, per house rules — appropriate).
- **Tests** cover the happy path, rejection, progress ordering, parallelism, and the guards. Coverage is honest for what exists.

## Gaps vs an authoritative asset-loader library

Almost the entire canonical surface is missing. Marking design-omission vs plain omission:

- **Concurrency limit (omission).** No max-in-flight / pool. `startResourceLoad` fires _all_ factories at once. A real loader caps concurrency (e.g. 4–8 simultaneous fetches) to avoid saturating the network/connection pool. This is the single most important missing feature and there is no way to express it.
- **Sequential mode (omission).** The Package Map promises "sequence or parallel," but only parallel exists. There is no serial queue, no ordered draining. The doc and the code disagree.
- **Retries / backoff (omission).** No retry count, no exponential/linear backoff, no per-item retry policy. A failed load is final.
- **Cancellation / abort (omission).** No `AbortController`/`AbortSignal` threading, no `cancelResourceLoad`/`abortResourceLoad`. Once started, a batch cannot be stopped, and individual factories get no abort signal.
- **Timeout (omission).** No per-item or batch timeout; a hung factory hangs the batch's `onComplete` forever.
- **Priority (omission).** No priority/ordering hints; items load in insertion order only.
- **Pause / resume (omission).** No `pauseResourceLoad` / `resumeResourceLoad`.
- **Per-item lifecycle events (omission).** Only aggregate signals exist. No `onItemStart` / `onItemComplete` / `onItemError(id, …)`, no item handle or id — `onError(error)` does not say _which_ item failed, and there is no way to correlate it to a queued promise except by catching that promise.
- **Byte-weighted / determinate progress (omission).** Progress is count-based only (loaded/total items). No bytes-loaded/bytes-total, no per-item weights, so a 1KB file and a 50MB file count equally.
- **Deduplication (omission).** No keying/caching; queuing the same URL twice loads it twice.
- **Error-policy choice (omission).** Continue-on-error is the only behavior. No fail-fast / stop-on-first-error option, and no aggregated error set surfaced at completion.
- **Re-use / reset (omission).** A loader is single-shot: after `start` it is permanently `started`; no `resetResourceLoader` to run another batch.
- **Resource-type integration (partial-by-design).** The loader is type-agnostic (`() => Promise<unknown>`), deferring actual image/audio/font/atlas loading to `@flighthq/resources`. Keeping the loader a pure orchestrator is a defensible boundary — _but_ an "authoritative" loader usually offers typed conveniences or at least an item-descriptor shape (key, url, type, weight) rather than a bare thunk.
- **No `dispose*` (omission).** The loader holds signal registries; there is no `disposeResourceLoader` to detach listeners, despite the house rule on `dispose*`.

## Naming / API-shape notes

- Names are clean and self-identifying: `createResourceLoader`, `queueResourceLoad`, `startResourceLoad` all carry the full type word. Good.
- `queueResourceLoad` returning the item promise while errors _also_ flow through `onError` is a slightly split contract — a caller who only watches signals can still leave per-item promise rejections unhandled (the tests have to `.catch(() => {})` to silence them). A canonical design would make the item handle first-class (id + signals) rather than relying on a floating promise.
- `ResourceLoader` in `@flighthq/types` is just the three signals; all the real state lives in the untyped `ResourceLoaderInternal` cast. That is the sanctioned pattern, but it means the public type tells a reader almost nothing about loader capability — there is little capability to describe yet.
- A future descriptor-based API (`queueResourceLoad(loader, { key, load, weight, priority, retries, signal })`) would be the natural shape once concurrency/retry/cancel land, and would also fix the per-item correlation gap.

## Recommendation

Treat this as an early stub and build it out to AAA scope, since it is squarely missing-by-omission, not missing-by-design. Priority order:

1. **Concurrency limit** (a worker-pool drain in `startResourceLoad` with a `maxConcurrent` option) — the defining feature of a batch loader and the one the current "fire everything" model actively gets wrong.
2. **Cancellation** via `AbortSignal` threaded to each factory + `cancelResourceLoad`.
3. **Sequential mode** to make the Package Map's "sequence or parallel" claim true.
4. **Retries with backoff** and a selectable **error policy** (continue vs fail-fast, with an aggregated error set on `onComplete`).
5. **Per-item handles/ids** so `onError` and progress can be correlated, then **byte/weight-aware progress**.
6. **Timeout**, **priority**, **dedup**, **reset/reuse**, and **`disposeResourceLoader`** to round out the canonical surface.

Until at least concurrency, cancellation, and retries exist, this should not be considered a robust loader — it is a thin parallel-promise-runner with progress signals.
