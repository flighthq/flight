# Loader Progress Currencies — item count, weighted fraction, and bytes

**Status: PROPOSAL, awaiting ruling.** Written by builder at manager's request for chief. No code
change is proposed here beyond the one bug fix in §5, which is independent of the ruling.

`@flighthq/loader` measures "how far along is this batch" in three different units. This note
describes what each currency actually is, shows where they contradict each other today, lays out the
real options, and recommends one.

## 1. The three currencies as they exist

| Currency | Where it surfaces | Unit | Known before the load? |
| --- | --- | --- | --- |
| **Item count** | `loader.onProgress(loaded, total)` | files finished / files queued | yes, exactly |
| **Weighted fraction** | `getResourceLoadProgress(loader)` | `weightLoaded / totalWeight` | yes, if the caller assigns `weight` |
| **Bytes** | `item.onBytesProgress(loaded, total)`, `report.bytes` | bytes transferred | no — only a `bytesHint`, per item |

They differ in more than scale. Item count and weighted fraction are **batch-level and monotonic**:
both advance once per item, in one place (`_countEntrySettled`), and both reach their maximum exactly
when the batch completes. Bytes are **per-item and continuous**: they tick many times during a single
item, and — critically — **there is no batch-level bytes total anywhere in the loader**. `bytesLoaded`
and `bytesHint` live on the individual pending entry; nothing sums them. `ResourceLoadReport.bytes` is
post-hoc, per item, available only after that item has finished.

So the three are not three views of one number. Two are batch-level completion measures that differ
only in how each item is scaled, and the third is a per-item transfer measure that has never been
aggregated.

## 2. The defect: the two batch-level currencies contradict each other

Both are live on the same loader object at the same instant, and they disagree. Queue two items —
a small one and a large one, weighted 1 and 99, which is exactly the case `weight` exists for — and
observe both after the small item finishes:

```
onProgress = 1/2  → 50%
getResourceLoadProgress = 0.01 → 1%
```

Same loader, same moment, same question. A progress bar wired to `onProgress` jumps to half after the
tiny file and then sits still through the entire real download; one wired to
`getResourceLoadProgress` shows the truth. Nothing in either name tells a caller which they are
getting, and nothing warns that assigning `weight` silently desynchronises them — `weight` changes the
accessor and has no effect on the signal.

This is the within-unit missing-primitive smell from AGENTS.md, in its usual form: one question
("how far along?") is being answered by two mechanisms that were never reconciled, so the caller's
choice between them is arbitrary and one of the two is always wrong.

## 3. What consumers actually do

The ruling asked for a cross-check against how progress bars consume these in the examples. **That
cross-check cannot be performed: there are no example consumers.** A repo-wide search for
`onProgress`, `getResourceLoadProgress`, and `onBytesProgress` outside `packages/loader` and its tests
returns exactly two call sites, neither an example and neither a progress bar:

- `packages/assets/src/assetLibrary.ts:131` — forwards `onProgress`'s `(loaded, total)` straight
  through to its own `options.progress` signal. **Item count.** It never sets `weight` and never
  touches bytes.
- `packages/scene3d-resources/src/sceneResourceResolver.ts` — imports the loader but consumes no
  progress at all.

This is itself worth recording. The currency question has no in-repo evidence to settle it, because
the loader's progress surface has never been driven by a real UI. `agents/examples-plan.md` has no
loading-screen or progress example planned either. I flag this rather than assert a user need I
cannot observe: the recommendation below is argued from the mechanics and from what a loading screen
demonstrably requires, not from usage that does not exist.

The one real consumer picking item count is weak evidence for it — `assetLibrary` forwards the signal
that was there, and would forward a better one just as readily.

## 4. Options

**A. Item count only.** Drop `weight`, emit and expose only `loaded/total`.
_For:_ one currency, no contradiction, exactly knowable up front, trivially portable to C.
_Against:_ throws away the one thing that makes a progress bar honest. A batch of one 40 MB texture
and nine tiny JSONs is 90% "done" while ~all the bytes are still in flight. Real loading screens
regress visibly. Deletes a working feature to resolve a naming problem.

**B. Weighted fraction only** — make `weight` the single currency, emit it from `onProgress`, keep
item count only inside `ResourceLoadReport`.
_For:_ one currency; `weight` already defaults to `1`, so an unweighted batch *is* the item-count
batch and today's default behavior is unchanged. Weight is caller-supplied, so it is known before the
first byte moves — progress starts at a truthful 0 and never rescales mid-flight.
_Against:_ callers who want a literal "3 of 12 files" string must read it from elsewhere; a fraction
alone cannot render that. Weight is only as good as the caller's estimate.

**C. Bytes as the primary currency**, aggregating `bytesHint` into a batch total.
_For:_ the currency users actually care about, and the only one that moves smoothly within a large
item instead of jumping per file.
_Against:_ needs a batch total that is not knowable up front. `bytesHint` is optional per item, so a
mixed batch has partial totals; any item lacking a hint either forces a guess or makes the
denominator grow mid-load, and a bar that rescales downward as it discovers more work is worse than a
coarse honest one. Bytes also can't cover non-transfer work (decode, parse, GPU upload). This is the
right *display* currency and the wrong *contract* currency.

**D. Keep all three, name them honestly, and make each answer one question.** No currency is deleted;
the contradiction is resolved by making which currency you are getting unambiguous at the call site,
and by giving the aggregate a single definition.

## 5. Recommendation — option D, with B as its default

The three currencies are not redundant; they answer three different questions, and the bug is that
two of them are wearing the same name. Concretely:

1. **`onProgress` emits the weighted fraction** — the same number `getResourceLoadProgress` returns,
   so the signal and the accessor can never disagree again. Since `weight` defaults to `1`, this is
   identical to today's behavior for every unweighted batch, including `assetLibrary`. It changes
   only the case that is currently wrong.
2. **Item counts stay available, under a name that says so.** A caller wanting "3 of 12" asks for it
   explicitly rather than getting it from whichever progress API they happened to reach for. This is
   the missing primitive: "how many items are done" and "how far along is the work" are two
   questions, and only one of them is progress.
3. **Bytes stay per-item and stay a display detail.** Aggregating them into a batch denominator is
   the one thing not to do, because the denominator is unknowable. Where a caller has full
   `bytesHint` coverage they can already pass hints *as* weights and get byte-accurate weighted
   progress with no new machinery — which is the honest version of option C, and worth documenting as
   the recipe rather than building a second aggregate.

The principle: **the contract currency should be knowable before the work starts, and the display
currency should be whatever the UI finds legible.** Weight satisfies the first because the caller
supplies it. Bytes fail it and are therefore reporting, not contract.

**No accompanying bug.** `getResourceLoadProgress` ends with an `internal.loaded / internal.total`
fallback that looks unreachable — `weight` defaults to `1`, so `totalWeight > 0` whenever any item is
queued, and the `total === 0` case returns earlier. It is reachable in exactly one way: a caller
explicitly weighting *every* item `0`. I expected that to divide by a zero total and produce `NaN`,
and probed it before writing it down; it does not. `totalWeight` is then `0`, the weighted branch is
correctly skipped, and the fallback returns the item fraction. The guard is right as written, and the
fallback is the sensible answer for a batch that declined to weight itself. Recording the negative
result because "this looks like dead code" is the kind of claim that gets acted on.

Under recommendation D that fallback becomes load-bearing rather than vestigial: it is what an
all-zero-weight batch reports through the unified currency.

## 6. What I am not proposing

- No change to `ResourceLoadReport`. Per-item `bytes`, `attempts`, and `elapsedMs` are outcome
  records, not progress, and they are correct as they are.
- No new package and no new signal type. This is a naming and definition change on an existing
  surface, plus one guard fix.
- No `weight` inference from `bytesHint`. Tempting, but it makes the denominator depend on which
  items happened to supply a hint — the same unknowable-total problem as option C, arriving quietly.
