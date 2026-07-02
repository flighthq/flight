---
package: '@flighthq/loader'
crate: flighthq-loader
draft: false
lastDirection: 2026-07-02
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

- **[2026-07-02] Missing types must be rebuilt.** The review (38/100) found 6 types imported from `@flighthq/types` that were never committed — likely lost work from another agent. These must be written to make the package compile. This is a blocking prerequisite.

  **Why:** The package cannot compile without its types. The self-reported 92/100 was contradicted by the review.

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

4. **Missing types scope.** Which of the 6 missing types need to be written from scratch vs reconstructed from the source that imports them? `ResourceLoadItem`, `ResourceLoaderOptions`, `ResourceLoadHandle`, `ResourceLoadReport`, `ResourceLoader`, and the signal types.

5. **Unknown-key sentinel.** `getResourceLoadItemStatus(loader, key)` returns `'pending'` for unknown keys. Should return `null` or gain an `'unknown'` status.

6. **Aggregated error surface.** Add a `ResourceLoadError[]` / failure summary on completion, or is filtering reports by status sufficient?

7. **Package Map update.** Current entry is `@flighthq/loader (batch queue)`. Expand.
