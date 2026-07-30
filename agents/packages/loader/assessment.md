---
package: '@flighthq/loader'
updated: 2026-07-30
basedOn: ./review.md
---

# loader — Assessment

The 2026-07-02 sweep list (rebuild missing types, extend the `ResourceLoader` interface, remove the
false "tracking shim" comment, Package Map description) is **entirely stale** — every item was
already resolved in the tree, and the charter itself records the missing-types item as a false alarm
raised from a stale review. Re-derived against the live source 2026-07-30.

## Recommended

1. **Finish byte progress — the shape is the open part.** Charter Decision #2 blesses building it, and
   it is still structurally dead: `ResourceLoadItem.onBytesProgress` is stored on the entry and never
   invoked, `entry.bytesLoaded` is never written, so `ResourceLoadReport.bytes` is always 0.
   (`bytesHint` is live — the token-bucket throttle uses it.) Finishing requires giving the factory a
   way to report bytes, which changes the `load` seam that `@flighthq/assets` consumes. The minimal
   additive shape is a second argument — `load: (signal, reportBytes) => Promise<T>` — so existing
   one-argument factories keep working, but the signature is a **seam decision and wants a ruling
   before it is built**, which is why this stays Recommended rather than done.
2. **Reconcile `onProgress` with `getResourceLoadProgress`.** The signal emits item counts
   (`loaded`, `total`); the getter returns a weight-weighted fraction when weights are set. A caller
   wiring a progress bar to the signal's two numbers gets a different curve than one polling the
   getter. Either the signal should carry the weighted fraction too, or the divergence should be
   documented as deliberate — currently it is neither.
3. **Bound `drainQueue` re-entrancy.** `settleEntry`, `resumeResourceLoad`,
   `setResourceLoaderConcurrency`, and streaming `queueResourceLoad` all start a drain, and the loop
   `await`s inside the token-bucket branch. Two concurrent drains can each observe
   `inFlight.size < maxConcurrent` after their awaits and both dispatch. Not observed in a test, and
   not fixed here for that reason — but the interleaving is reachable by inspection and worth either
   proving impossible or serializing.

## Backlog

- **Decompose the 657-line monolith.** _Parked — needs decomposition plan._ Charter Decision #3. The
  2026-07-30 pass extracted `_countEntrySettled` and `_isOrphaned` because the defects demanded them;
  the token bucket, the drain loop, and the signal wiring are still bundled.
- **AbortSignal integration.** _Parked — design-gated._ Charter Decision #4. Note the internals
  already use `AbortController` per entry and pass the signal to the factory; what is missing is the
  caller-facing seam for supplying an external signal.
- **Configurable fail policy — the remaining half.** `errorPolicy: 'continue' | 'fail-fast'` ships;
  charter Decision #5's third mode (stop dispatching new items but let in-flight finish) does not.
- **Unknown-key sentinel.** _Parked — API shape decision._ Charter Open direction #5.
  `getResourceLoadItemStatus` returns `'pending'` for a key that was never queued, which is
  indistinguishable from a real pending item.
- **Aggregated error surface.** _Parked — API shape decision._ Charter Open direction #6.
- **Rust `flighthq-loader` crate.** _Parked — global posture + AbortSignal seam._

## Approved

- [2026-07-02 · picked] Sweep items 1–4 — **all four confirmed already done** 2026-07-30; nothing was
  outstanding.
