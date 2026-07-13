---
package: '@flighthq/displayobject'
status: solid
score: 80
updated: 2026-07-13
ingested:
  - charter.md
  - status.md
  - review.md (2026-06-24, superseded — written against the builder bundle, not this tree)
  - source # live packages/displayobject/src + colocated tests
---

# displayobject — Review

## Verdict

**solid — 80/100.** The pruned core the 2026-06-25 Decisions blessed, now landed and clean: seven kinds (`DisplayObject`, `DisplayContainer`, `Bitmap`, `Stage`, `Video`, `HtmlView`, `RenderView`), each an entity/runtime quartet with a `compute*LocalBoundsRectangle` wired through `defaultMethods`, plus the new **color-adjustments runtime-slot API** — the generic replacement for the removed color-transform trait. The prior review (82, 2026-06-24) described a builder bundle (`Loader`, the seven-field `Stage`, `cacheAsBitmap`/`scrollRect`/`opaqueBackground`, lifecycle signals) that the charter has since ruled **dropped**; none of it is in this tree, correctly. The score reflects a smaller but charter-aligned surface: what remains is a Stage that has not yet re-grown the fields the Decision said it *keeps*, a few setter asymmetries, and dead debt (`internal.ts`, an unused `@flighthq/geometry` dependency).

## Present capabilities

Grounded in `packages/displayobject/src/`:

- **Base entity (`displayObject.ts`).** `createDisplayObject` / `createDisplayObjectGeneric` compose the trait-init sequence (transform2D, boundsRectangle, appearance, material, clip); `createDisplayObjectRuntime` layers the runtime traits and stamps `DisplayObjectTraitsKey` (read back by `isDisplayObject`). `setDisplayObjectClip` sets the clip region and invalidates appearance.
- **Color adjustments (new since the prior review — commits `df810bf5`/`7ec54aea`).** `addDisplayObjectColorAdjustment`, `setDisplayObjectColorAdjustments`, `getDisplayObjectColorAdjustments`, and the single-tint convenience `setDisplayObjectColorTransform` operate on the `NodeRuntime.colorAdjustments` slot (`@flighthq/types` `Node.ts`). The private `resolveDisplayObjectColorAdjustments` **fuses once on set** (never per frame) into the cached `resolvedColorTransform` — reused in place to avoid per-set churn — and raises `colorAdjustmentsChannelMixing` when the fused stack has off-diagonal terms the 8-float fold cannot carry, for the render walk's shakeable guard to report. This is the adjustments tier's "data folds" rule realized on the node: the render walk only reads the cache; the gl/wgpu folds (`enableGlColorAdjustment`/`enableWgpuColorAdjustment`) consume it downstream.
- **Leaf kinds.** `Bitmap` (`image`/`smoothing`/`sourceRectangle`, exactly the Decision's field set; `setBitmapImage` splits invalidation correctly into local-content + local-bounds, not appearance), `Video` (`setVideoSource`/`setVideoSmoothing` with the same content-tier reasoning in comments), `HtmlView`/`RenderView` (`set*Size` with guard-then-invalidate), `Stage` (`color`/`stageWidth`/`stageHeight`, `setStageSize` guards, invalidates local bounds, and emits `onResize`), `DisplayContainer` (thin runtime-only wrapper).
- **Stage helpers + signals.** `getDisplayObjectStage` derives stage membership from `getNodeRoot` — no privileged `stage` back-pointer survives (the old traversal wrappers and stage-depth helpers are gone per the Decisions). `StageSignals` (`onResize`/`onFullscreenChanged`/`onOrientationChanged`) behind `enableStageSignals`.
- **Contract hygiene.** Single root barrel, `sideEffects: false`, types all from `@flighthq/types`, `out`-param bounds functions, sentinel `null` returns, full unabbreviated names. 96 tests across 7 colocated files, including the new color-adjustment surface (fuse cache reuse, channel-mixing flag, null-clears).

## Gaps

- **Stage is thinner than its own Decision.** The 2026-06-25 ruling says Stage *keeps* surface geometry — `scaleMode`, `align`, `contentsScaleFactor`, fullscreen dims — while shedding app/input concerns. Live `StageData` has only `color`/`stageWidth`/`stageHeight`. The kept set was never re-landed after the prune (the bundle carrying it was discarded wholesale).
- **Signals with no producer.** `StageSignals.onFullscreenChanged` and `onOrientationChanged` are constructible but emitted nowhere in-package (only `setStageSize → onResize` fires). Either the emitting fields/setters return with the Stage geometry set above, or the two signals are premature surface.
- **Bitmap setter asymmetry.** `smoothing` and `sourceRectangle` are blessed data fields (the Decision names both) but have no setters — only `setBitmapImage` exists — while `Video` has `setVideoSmoothing`. A caller mutating `bitmap.data.smoothing` directly bypasses invalidation.
- **Guard inconsistency across setters.** North star #1 says setters "compare, short-circuit on equality." `setStageSize`/`setHtmlViewSize`/`setRenderViewSize` do; `setDisplayObjectClip`, `setBitmapImage`, `setVideoSource`, `setVideoSmoothing` set-and-invalidate unconditionally.
- **Dead module `internal.ts`.** `DisplayObjectInternal` has zero importers anywhere in the repo, is not in the barrel, and `Omit<…, 'stage'>` names a field that no longer exists on `DisplayObject`. The charter's Open direction #8 asked whether to migrate this cast to runtime slots; the answer the tree gives is simpler — it is dead and can be deleted.
- **Unused dependency.** `package.json` declares `@flighthq/geometry`; no source file imports it (only `signals`, `node`, `adjustments`, `materials`, `types` are used). Same hygiene class as the `textlayout` drop logged 2026-06-25.

## Charter contradictions

The charter now speaks, so this section is substantive:

- **Decision vs. code: the kept Stage fields are absent** (above). The code does not contradict the *spirit* (nothing dropped-by-decision snuck back), but the "Stage keeps surface geometry" half of the decomposition ruling is unimplemented.
- **North star #1 partially violated** by the unguarded setters listed above — minor, mechanical.
- **The charter body carries internal staleness**: North star #3 still cites `HasCacheAsBitmap` and #5 the "complete `Stage` field set, `Loader`" — both superseded by the Decisions section itself (which says so for the cacheAsBitmap case). Boundaries "In scope" still lists `Loader` and the compositing-hint data. Candidate charter revision at the next direction pass: prune the pre-Decision draft prose so a fresh agent cannot re-derive dropped features from the charter's own North star.

Nothing dropped-on-sight has reappeared: no `cacheAsBitmap`/`scrollRect`/`opaqueBackground`, no `Loader`, no lifecycle signals, no `pixelSnapping`. The drop discipline held.

## Contract & docs fit

- **(a) Contract:** strong. Types-first (`colorAdjustments`/`resolvedColorTransform`/`colorAdjustmentsChannelMixing` live on `NodeRuntime` in `@flighthq/types` with ownership comments), diagnostics inverted (the channel-mixing sentinel is a flag the render walk's guard reports — no message here), allocation explicit (the fuse cache is reused in place, documented). The `@flighthq/geometry` dep is the one hygiene miss.
- **(b) Docs:** the Package Map line ("bitmaps, shapes, containers, masks, stages, videos") is still wrong — no shapes, no masks, and it omits `HtmlView`/`RenderView`; flagged since 2026-06-24, still unfixed. The prior `review.md`/`assessment.md` described the discarded bundle; this review supersedes both. `package.json` `description` ("bitmaps, shapes, text, masks, blend modes") has the same drift.

## Candidate open directions

1. **Re-land the kept Stage geometry** (`scaleMode`, `align`, `contentsScaleFactor`, fullscreen dims) — the Decision already blesses it, but the field set touches `@flighthq/types` `StageData` and the renderers that honor `scaleMode`, so sequencing (data-first vs. with a consuming backend) needs a call given Open direction #2's no-unhonored-data lean.
2. **Who emits `onFullscreenChanged`/`onOrientationChanged`?** Application/windowing owns fullscreen per the Decisions; is the emitter a `@flighthq/application` integration, or do the signals move there?
3. **Are unconditional setters acceptable for reference-typed fields** (`clip`, `image`, `source`) where equality is identity and re-set-same-reference is rare, or should North star #1's guard rule be absolute? A one-line ruling settles the inconsistency either way.
4. **Charter prose cleanup** — reconcile North star #3/#5 and Boundaries with the 2026-06-25 Decisions (user's gate; the Decisions ledger itself already says the draft is stale).
