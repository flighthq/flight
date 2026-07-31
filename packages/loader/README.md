# @flighthq/loader

## Progress: three currencies, one contract

A load can be measured three ways, and they answer different questions. Asking for the wrong one is how a progress bar and a counter end up disagreeing on the same batch.

**`getResourceLoadProgress(loader)` — the 0..1 weighted fraction.** This is _the_ progress number, and `onProgress` emits exactly it, so the signal and the accessor can never diverge. Each item counts for its `weight` (default `1`), so an unweighted batch is simply the item fraction.

**`getResourceLoadCounts(loader)` — how many items, and where they are.** `settledItems`, `inFlightItems`, `queuedItems`, `totalItems`. In-flight and queued are separate numbers because a concurrency limit makes them differ: "loading 4 of 200" is the in-flight count, not the queue depth. Use these for a literal "3 of 12 files" readout.

**`getResourceLoadBytes(loader)` — what the load knows about its byte volume.** `bytesLoaded` is summed, monotonic, and always valid. `bytesTotalKnown` and `itemsWithKnownBytes` are labeled _known_ on purpose: `bytesHint` is optional per item, so the known total is a floor that grows as more items declare a size. Compare `itemsWithKnownBytes` against `totalItems` to judge whether it covers enough of the batch to divide by.

### The principle

**The contract currency must be knowable before the work starts.** Weight qualifies because the caller supplies it: progress starts at a truthful 0 and never rescales. Bytes do not — a byte denominator grows as headers arrive, so a bar driven by it slides backwards as the loader discovers more work. That is why weight is the contract and bytes are reporting.

### Recipe: a byte-accurate progress bar

When you know each item's size, pass those sizes _as weights_ and the weighted fraction becomes byte progress, with no second aggregate and no moving denominator:

```ts
for (const asset of manifest) {
  queueResourceLoad(loader, {
    bytesHint: asset.size,
    weight: asset.size, // weight in bytes -> getResourceLoadProgress is byte progress
    load: (signal, reportBytes) => fetchAsset(asset, signal, reportBytes),
  });
}
```

Partial size knowledge is deliberately not smoothed over in core: there is no byte-total estimator, because calibrating bytes-per-weight only works when weights are already byte-proportional — in which case the caller knows the total from its own hints anyway.

### Edge cases

- An empty loader reports progress `1`. A batch of nothing is complete, which keeps `await` semantics consistent, and counts report zeros.
- No query returns `NaN`. Every division is guarded by the zero check in front of it.
- A batch whose items are _all_ explicitly `weight: 0` falls back to the item fraction, since the weighted fraction is undefined for it.
