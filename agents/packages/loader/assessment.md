---
package: '@flighthq/loader'
updated: 2026-07-02
basedOn: ./review.md
---

# loader — Assessment

Verified against the live tree (1 source file, 1 test file, 62 tests, 13 exports), the prior review (reject — 38/100), and the direction session (2026-07-02). Six charter decisions blessed. The package has significant issues: missing types in `@flighthq/types` (likely lost agent work), dead byte-progress surface, and a 657-line monolith.

## Recommended

Sweep-safe: prerequisites to make the package compile and pass review.

1. **Rebuild missing types in `@flighthq/types`.** Per charter Decision #1. The review found 6 types imported but never committed: `ResourceLoaderOptions`, `ResourceLoadItem`, `ResourceLoadHandle`, `ResourceLoadReport`, `ResourceLoadItemStatus`, `ResourceLoaderItemSignals`. Write them to `@flighthq/types` (one concept per file, types-first). This is blocking — nothing else works until the package compiles.

2. **Extend the `ResourceLoader` interface with missing signals/payloads.** Per review Blocking #2. Add `onCancel`/`onPause`/`onResume` signals and correct `onComplete`/`onError` payload types to match what `createResourceLoader` assigns.

3. **Remove the false "tracking shim" comment.** Per review Non-blocking. Lines claim `entry.onBytesProgress` is a shim — no such shim exists. Delete the misleading comment.

4. **Package Map description update.** Expand the current "(batch queue)" entry.

## Backlog

- **Decompose the 657-line monolith.** _Parked — needs decomposition plan._ Charter Decision #3. Candidates: token-bucket rate limiter, drain loop, progress accumulator, signal wiring.
- **Finish byte-progress feature.** _Parked — needs factory signature design._ Charter Decision #2. Requires changing `() => Promise<T>` to accept byte-reporting context.
- **AbortSignal integration.** _Parked — design-gated._ Charter Decision #4 blesses AbortSignal for TS. Needs API shape design (where does the signal attach — per-item, per-batch, both?).
- **Configurable fail policy.** _Parked — design-gated._ Charter Decision #5 blesses configurability. Shape (enum vs callback) is Open direction #1.
- **Unknown-key sentinel.** _Parked — API shape decision._ Charter Open direction #5.
- **Aggregated error surface.** _Parked — API shape decision._ Charter Open direction #6.
- **Rust `flighthq-loader` crate.** _Parked — global posture + AbortSignal seam._

## Approved

- [2026-07-02 · picked] Sweep items 1–4: rebuild missing types, extend ResourceLoader interface, remove false comment, Package Map description
