---
package: '@flighthq/loader'
crate: flighthq-loader
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# loader — Charter

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

## What it is

`@flighthq/loader` is the **type-agnostic batch orchestrator** for asynchronous work — it queues many `() => Promise<T>` loads, drains them under bounded concurrency, and reports aggregate progress, completion, and errors. It knows nothing about images, audio, fonts, or any concrete resource: its single seam is the `() => Promise<T>` factory, with every shared type (`ResourceLoadItem`, `ResourceLoaderOptions`, `ResourceLoadHandle`, `ResourceLoadReport`, the `ResourceLoader` signal entity) defined `@flighthq/types`-first. It depends only on `@flighthq/signals` and `@flighthq/types`.

Where it ends and a neighbor begins: the loader is the **scheduler**, not the **decoder**. Typed conveniences that produce a load item from a URL (`createImageResourceLoadItem`, etc.) and any file→value parsing belong in `@flighthq/resources` (and the per-subject `-formats` triads), which _consume_ the loader. The loader holds no scene-graph node and parses no bytes, so the source-data/graph fork and the subject triad do not bite here — there is no `loader-formats` neighbor.

## North star (proposed)

_Proposed from the design + the structural forks; not blessed. Edit or move to Open directions in review._

- **Type-agnostic to the bone.** The orchestrator's only contract is `() => Promise<T>`. It never grows knowledge of what it is loading; concrete-resource concerns live in `resources`, never here. This boundary is the package's reason to exist.
- **Types-first, single root export, side-effect-free.** Every cross-package type lives in `@flighthq/types`; the package is a thin barrel with `"sideEffects": false` and no module-top-level registration, listeners, or timers. Signal groups are opt-in via `enable*`.
- **Canonical batch-loader completeness.** Bounded concurrency, cancellation, retries-with-backoff, fail-fast vs continue, timeout, priority, dedup, weight-aware progress, pause/resume, live retune, streaming, and reset/reuse are all the table stakes of a mature batch loader and are expected to stay coherent as the package grows.
- **Honest features only.** A feature is either wired end-to-end and tested against a non-trivial outcome, or it is not present. Half-wired tiers that can only ever produce a constant (the current byte-progress state) are a defect, not a partial credit.
- **A clean Rust conformance target.** Deterministic, GPU-free orchestration is the ideal early Rust↔TS conformance subject; the type seam should be portable to the Rust port (the `AbortSignal`/`DOMException` question below is the open part of this).

## Boundaries (proposed)

_Proposed; not blessed._

**In scope:**

- Scheduling and draining batches of `() => Promise<T>` loads under explicit concurrency, priority, and error policy.
- Lifecycle control of a running batch: cancel, pause/resume, live retune of concurrency/priority, streaming enqueue, reset/reuse.
- Aggregate reporting: weight-aware and group-filtered progress, per-item status reports, and the loader/item signal groups.

**Out of scope (non-goals):**

- Knowing about any concrete resource type (image/audio/font/atlas/tileset) — that lives in `@flighthq/resources` and the per-subject triads.
- File→value parsing / decoding of any kind — no `loader-formats` neighbor exists or should.
- Holding scene-graph nodes or participating in the graph.

## Decisions

None blessed yet.

## Open directions

Every candidate question carried from `review.md`, plus the structural forks that touch this package. An agent **asks** here rather than assuming.

- **`AbortSignal` / `DOMException` in the type seam (blocks the Rust mirror).** `ResourceLoadItem.load` takes a web/DOM `AbortSignal`, and cancellation/timeout surface a `DOMException`. Should `@flighthq/types` define a Flight-neutral `CancellationToken` (web → `AbortSignal`, Rust → cancel token) per the Rust-port async/`Send` guidance, or is the DOM type the accepted seam? This is a `types`-level decision and blocks `flighthq-loader`.
- **First-class byte tracking vs. removal.** The bytes / `onBytesProgress` / `bytesHint` / `maxBytesPerSecond` tier is currently non-functional (`report.bytes` is always `0`; the "tracking shim" the code comments describe does not exist; `bytesHintDefault` is documented but unimplemented). The fork: (a) finish it — extend `load` to `(signal, ctx)` so the loader injects a `reportBytes` that writes `entry.bytesLoaded` (a source-breaking factory-signature change) — or (b) cut the dead surface until it can be done right. Either way the token-bucket throttle's "advisory, not a hard budget" semantics need a blessed stance, and the rate bound needs a real test.
- **Fail-fast scope.** Does `'fail-fast'` mean "stop dispatching new work" (current behavior — only `pending` entries are cancelled) or "abort in-flight peers too"? The semantics are undocumented in the type and untested for the in-flight case; they need a decision and a pinning test.
- **Unknown-key sentinel.** `getResourceLoadItemStatus(loader, key)` returns `'pending'` for an unknown key, conflating "queued, not started" with "no such item" — violating the sentinel rule for an expected-failure lookup. Should it gain an `'unknown'`/`'missing'` status member or return `null`?
- **Aggregated error surface.** The roadmap's Silver item asked for a first-class `ResourceLoadError[]` / failure summary on `onComplete`; today a caller must filter `reports` by `status === 'failed'` themselves. Bless "reports are sufficient" or add the accessor?
- **Boundary with `@flighthq/resources`.** Confirm the loader stays type-agnostic and that typed conveniences (`createImageResourceLoadItem(url)`, etc.) live in `resources`, consuming the loader. The charter should bless this boundary as a non-goal.
- **Example / docs obligation.** The `batchloading` example named in the status doc is absent from this bundle's delta; the "docs + examples" obligation is unverified. Does the package need a gallery example to be considered complete?
- **Structural forks — record the resolutions.** Fork A (source-data vs graph participation) and the subject triad do **not** apply: a loader holds no node and parses nothing, so no `loader-formats` neighbor should exist. Fork F (thin-by-design vs under-built): loader has moved out of the "under-built stub" column into "solid"; the charter should record that it is no longer a stub to push on. Fork D (Wasm `-rs` mixing): the deterministic orchestrator is a candidate value-typed leaf — is `loader-rs` a worthwhile mixing target, or is it only meaningful inside a full Rust runtime?
