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

## Closed 2026-07-30

*Finish byte progress* — **done**. `ResourceLoadItem.load` takes `(signal, reportBytes)`; the reporter
feeds `onBytesProgress` and `ResourceLoadReport.bytes`. Additive, so existing one-argument factories
are untouched. See the charter decision for the shape and why the reporter is attempt-scoped.

## Recommended

1. **Reconcile the three progress currencies.** This is now sharper, not solved: `onProgress` emits
   ITEM counts, `getResourceLoadProgress` returns a WEIGHT-weighted fraction, and bytes are a third
   currency reachable only per-item. A caller wiring a progress bar picks one and gets a different
   curve from the other two. Byte progress deliberately did **not** touch `onProgress` — changing what
   its two numbers mean is a breaking semantic change, not a wiring fix — so the divergence is
   unchanged in kind and merely more visible. **Wants a ruling**: either a single declared currency
   with the others derived, or an explicit statement in the header that the three answer different
   questions.
2. **Bound `drainQueue` re-entrancy.** Unchanged from 2026-07-30: `settleEntry`, `resumeResourceLoad`,
   `setResourceLoaderConcurrency`, and streaming `queueResourceLoad` all start a drain, and the loop
   awaits inside the token-bucket branch, so two concurrent drains can each observe a free slot and
   both dispatch. Reachable by inspection; I could not produce it in a test, which is why it is still
   a finding rather than a fix.

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
