---
package: '@flighthq/loader'
updated: 2026-08-08
by: principal
---

# loader — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against `packages/loader/src/` and `packages/types/src/` on 2026-08-08.
A file:line here is a claim about this tree, not about a session.

- **Group progress is the item fraction while ungrouped progress is weighted.**
  `getResourceLoadProgress(loader, group)` returns `groupReports.length / groupTotal`
  (`resourceLoader.ts:326`); the ungrouped path returns `weightLoaded / totalWeight` (`:334`). This is
  the same two-answers-to-one-question defect that was removed from `onProgress`, surviving on the
  group path — a weighted batch reports two different fractions depending on whether a group is named.
- **An unknown key is indistinguishable from a queued one.** `getResourceLoadItemStatus` falls through
  to `'pending'` for a key that was never queued (`resourceLoader.ts:299`).
- **No guard or `explain*` module.** `packages/loader/src/` is `resourceLoader.ts` plus the two lane
  files; there is no `enableResourceLoaderGuards`, so the sentinel above and the queue-after-start
  throw (`:354-356`) have no caller-facing diagnostic layer.
- **The bandwidth throttle is advisory, not a budget.** `drainQueue` is `async` and re-entrant — it is
  invoked from `startResourceLoad`, `resumeResourceLoad`, `setResourceLoaderConcurrency`,
  `queueResourceLoad`, and every `settleEntry` — and its check→consume pair (`:517-525`) is not
  serialized, so concurrent drains can both pass the same tokens. It also gates on the declared
  `bytesHint` and never meters transferred bytes.
- **`bytesHint: 0` (the default) is free.** Items without a hint cost no tokens (`:516`), so a mixed
  batch throttles only the items that declared a size.
- **The `PendingEntry` pool is module-scoped** (`:41`) — one LIFO stack shared by every loader in the
  process, with no cap.
- **Web types sit on the portable seam.** `ResourceLoadItem.load` takes an `AbortSignal`
  (`packages/types/src/ResourceLoadItem.ts:8`) and cancel/timeout are `DOMException`
  (`resourceLoader.ts:147`, `:584`, `:753`). No neutral cancellation token exists.
- **Nothing drives the progress surface.** No example or functional scene imports `@flighthq/loader`;
  the only consumers are `packages/assets/src/assetLibrary.ts:157` (which reads counts, not progress)
  and `packages/scene3d-resources`, which consumes no progress at all. Every progress decision here is
  argued from mechanics, not from observed use.
- **`sortPendingByPriority` re-sorts the whole pending array on every dispatch** (`:511`), inside the
  drain loop.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. The headline claim checked out **false**:
  the two-batch-level-currency contradiction in `agents/loader-progress-currencies.md` §2 no longer
  exists in code — `onProgress` emits the single 0..1 weighted fraction (`resourceLoader.ts:779`,
  `packages/types/src/ResourceLoader.ts:14`), item counts moved to `getResourceLoadCounts` (`:278`),
  and bytes to `getResourceLoadBytes` (`:247`); that doc is still unratified as a proposal but its
  defect is closed. Also dropped: the `bytesHintDefault` docstring (zero occurrences in the tree), the
  "factory signature cannot report bytes" limitation (`load(signal, reportBytes)` landed, with an
  attempt-scoped reporter at `:575`), and `examples/batchloading` (absent — `examples/packages/` has no
  loader example at all).
- **2026-06-25** — Removed the false "tracking shim" comment in `runEntry`; added a rate-bound throttle
  test and a fail-fast scope regression test.
- **2026-06-24** — Gold pass: `ResourceLoadReport.bytes`, `bytesHint`, `onBytesProgress`,
  `maxBytesPerSecond` token bucket, and the `PendingEntry` pool.
