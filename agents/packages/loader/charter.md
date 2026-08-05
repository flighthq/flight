---
package: '@flighthq/loader'
role: package
crate: flighthq-loader
draft: false
lastDirection: 2026-07-30
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# loader — Charter

## What it is

`@flighthq/loader` is the **type-agnostic batch orchestrator** for asynchronous work — it queues many `() => Promise<T>` loads, drains them under bounded concurrency, and reports aggregate progress, completion, and errors. It knows nothing about images, audio, fonts, or any concrete resource: its single seam is the `() => Promise<T>` factory, with shared types defined `@flighthq/types`-first. Dependencies: `signals`, `types`.

Where it ends and a neighbor begins: the loader is the **scheduler**, not the **decoder**. Typed conveniences that produce a load item from a URL and any file→value parsing belong in the per-resource packages, which _consume_ the loader. The loader holds no scene-graph node and parses no bytes.

## North star

1. **Type-agnostic to the bone.** The orchestrator's only contract is `() => Promise<T>`. It never grows knowledge of what it is loading. This boundary is the package's reason to exist.
2. **Honest features only.** A feature is either wired end-to-end and tested, or it is not present. Half-wired tiers that produce constants are a defect.
3. **Canonical batch-loader completeness.** Bounded concurrency, cancellation, priority, fail-policy, progress, pause/resume, and reset/reuse are table stakes.

## Boundaries

**In scope:**

- Scheduling and draining batches of `() => Promise<T>` loads under explicit concurrency, priority, and error policy.
- Lifecycle control: cancel, pause/resume, live retune of concurrency/priority, reset/reuse.
- Aggregate reporting: progress, per-item status, loader/item signal groups.
- `AbortSignal` integration for external cancellation wiring.
- Configurable fail policy (what happens when an item fails).
- Byte-weighted progress (must be built — currently dead surface).

**Non-goals:**

- Knowing about any concrete resource type — per-resource packages consume the loader.
- File→value parsing / decoding — no `loader-formats` neighbor.
- Scene-graph nodes or graph participation.

## Decisions

- **[2026-07-02] ~~Missing types~~ — false alarm.** Types were already present and correctly defined in `@flighthq/types`. The depth review was based on stale state. No action needed.

- **[2026-07-30] Progress measures completion, not success.** `weightLoaded` advanced only on the success path, so any batch containing a failure, a cancellation, or a fail-fast skip left `getResourceLoadProgress` permanently short of 1 — a weighted progress bar frozen at 0.67 on a batch that had already emitted `onComplete`. A failed item is a finished item; whether it went well is what `ResourceLoadReport.status` is for. Both counters now advance together in one `_countEntrySettled` helper, because "how much of the batch is done" is a single question asked in two units, and having it answered in six scattered places is how the two fell out of step. User-directed.

- **[2026-07-30] A reset orphans what is already in flight.** `resetResourceLoader` aborted in-flight loads but nothing stopped their eventual rejection from settling against whatever batch had replaced them — a phantom `onError` for a key the new batch never queued, an extra report, and an inflated loaded count that could complete the new batch early. The loader now carries a generation counter stamped onto each entry at queue time; reset bumps it, and a settling entry whose stamp is stale is discarded. In-flight entries are deliberately *not* returned to the pool on reset: they are still running, and recycling one would hand a live entry to the next `queueResourceLoad`. User-directed.

- **[2026-07-30] Cancelling before start is a real cancellation.** `cancelResourceLoad` returned early when `!started`, which emitted nothing *and* left every queued handle's promise pending forever — a caller that queued a batch, changed its mind, and awaited the handles simply hung. It now rejects the queued items, reports them `cancelled`, and emits `onCancel`. **Worth recording separately:** the old behavior was pinned by a test asserting only that no signal fired, so the stranded promises were invisible to it — the assertion described the implementation rather than the contract, the same accommodation pattern the `physics2d` charter names as a standing rule. A cancel that does not cancel is precisely the half-wired feature this charter's North star #2 calls a defect. User-directed.

- **[2026-07-30] Byte progress is built: the factory reports, the loader cannot.** Settles the 2026-07-02 decision below. The missing piece was never plumbing — it was that only the factory can observe a transfer's byte count, so `ResourceLoadItem.load` now takes a second argument, `(signal, reportBytes) => Promise<T>`. Additive on purpose: a one-argument factory keeps compiling and keeps working and simply never reports, so nothing that exists today had to change. What the caller already declared now works — `onBytesProgress` receives each reported figure (with `bytesHint` standing in for an omitted total), and `ResourceLoadReport.bytes` carries the last one instead of a permanent zero. `bytesHint` keeps its separate job of pacing the token-bucket throttle. The reporter is scoped to one attempt and goes inert when that attempt settles, because entries are pooled and a late report would otherwise write a byte count into whichever item had since been handed that record. User-directed (approved as proposed).

- **[2026-07-02] Byte progress must be built, not cut.** `report.bytes` is always 0 and `onBytesProgress` is never called — structurally dead. The feature should be finished (requiring a factory signature change to inject byte reporting), not removed.

  **Why:** Byte-weighted progress is a canonical batch-loader feature. Cutting it would leave a gap; the dead surface is worse than either finishing or removing, and finishing is the AAA path.

- **[2026-07-02] The 657-line monolith should be decomposed.** All 13 exports live in one file with an internal token-bucket drain loop. Big files and big functions are both monoliths — extract the missing primitives underneath.

  **Why:** Complexity is a decomposition smell. The token-bucket, the drain loop, the progress reporting, and the signal wiring are likely separate primitives bundled in one file.

- **[2026-07-02] Start with `AbortSignal` for cancellation.** The TS API uses `AbortSignal` — the web standard that `fetch()`, streams, and every `load*` function in the SDK already accept. The Rust crate will use its own cancellation primitive (`CancellationToken`, channel, etc.) and conformance maps the behavior, not the type.

  **Why:** AbortSignal is already the SDK's cancellation primitive in every resource loader. Inventing a Flight-neutral `CancellationToken` for the TS side would be the only divergence from the web standard. The slight name overload with `@flighthq/signals` is acceptable — they are different concepts (event signals vs abort signals).

- **[2026-07-02] Configurable fail policy.** When a load item fails, behavior should be configurable — not hardcoded. The policy governs whether to continue loading, stop dispatching new items, or abort everything in-flight.

  **Why:** Different use cases need different failure behavior. Loading a game's required assets → abort on failure. Loading optional thumbnails → continue on failure.

- **[2026-07-02] TS is the spec; Rust conforms in parity passes later.** Global posture.

## Open directions

1. **Fail policy shape.** An enum (`'continue' | 'stop' | 'abort'`) covers the three standard cases. A callback (`(key, error) => 'continue' | 'stop' | 'abort'`) gives per-item decision power. Could accept either — string for the common case, callback for custom logic. Needs design.

2. **Decomposition plan.** What extracts from the monolith? Candidates: token-bucket rate limiter, drain loop, progress accumulator, signal wiring. Need to find the natural primitive boundaries — decompose to bedrock, not further.

3. **Byte progress factory signature.** Finishing byte progress requires the factory to accept a byte-reporting callback or context object. The current `() => Promise<T>` signature cannot report bytes. Shape of the extension (overload? options object? wrapper type?) needs design.

4. **Unknown-key sentinel.** `getResourceLoadItemStatus(loader, key)` returns `'pending'` for unknown keys. Should return `null` or gain an `'unknown'` status.

5. **Aggregated error surface.** Add a `ResourceLoadError[]` / failure summary on completion, or is filtering reports by status sufficient?

6. **Package Map update.** Current entry is `@flighthq/loader (batch queue)`. Expand.
