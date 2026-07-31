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

_None open._ Both prior items are closed; see [Landed](#landed) and [Investigated](#investigated).

## Landed

- ~~**Reconcile the three progress currencies.**~~ Ruled by chief and implemented 2026-07-31.
  `onProgress` now emits the 0..1 weighted fraction — literally `getResourceLoadProgress(loader)` at every
  emit site, so the signal and the accessor cannot diverge by construction. Counts and bytes became
  named queries (`getResourceLoadCounts`, `getResourceLoadBytes`) so a caller has to say which currency
  it means. `packages/loader/README.md` carries the three currencies, the byte-accurate recipe, and the
  contract-currency-must-be-knowable-before-work-starts principle.

## Investigated

- **`drainQueue` re-entrancy — investigated 2026-07-31 and NOT reproducible as stated; retired.** The
  finding was that four call sites start a drain and the loop awaits inside the token-bucket branch, so
  "two concurrent drains can each observe a free slot and both dispatch". The concurrency bound in fact
  holds, for a structural reason: the `inFlight.size < maxConcurrent` test is part of the `while`
  condition, the only `await` in the loop is followed by `continue` — which returns to that condition —
  and the dispatch (`pending.shift()` then `inFlight.add`) is synchronous after it with no await in
  between. There is no window where one drain has passed the guard and another can slip through.

  Tried to break it empirically as well as by reading: a throttled loader (the only configuration that
  reaches the awaiting branch at all — without `maxBytesPerSecond` the loop never yields), in streaming
  mode, hammered across the delay window from every entry point that starts a drain, including repeated
  `setResourceLoaderConcurrency` and `queueResourceLoad`. Peak in-flight never exceeded the configured
  bound.

  **One residual, smaller than the original claim and not a correctness break:** two drains parked in
  `delay` can both wake, both re-read `tokenBucketDelayMs` as 0, and both `consumeTokens`, transiently
  over-drawing the byte bucket by one entry. That overspends the *rate* slightly; it does not exceed
  concurrency and it self-corrects as the bucket refills. Recorded rather than fixed, since a guard for
  it would cost every drain to smooth a transient in an optional throttle.


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
