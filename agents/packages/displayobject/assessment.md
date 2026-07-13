---
package: '@flighthq/displayobject'
updated: 2026-07-13
basedOn: ./review.md
---

# displayobject — Assessment

Sorted from `review.md` (solid — 80/100, 2026-07-13). The prior assessment (2026-06-24) was written against the discarded builder bundle; its three Recommended items are gone with that source (the `textlayout` drop already landed 2026-06-25; the Loader and fullScreen items target entities that no longer exist). Everything below is re-derived from the live tree. The charter now carries real Decisions, which resolves most former design gates; the remaining parked items wait on the Stage-geometry sequencing question (Open direction #1 of the review).

## Recommended

Sweep-safe: within `@flighthq/displayobject`, no cross-package coupling, no breaking change, no open design decision.

- **Delete the dead `internal.ts` module.** `DisplayObjectInternal` has zero importers repo-wide, is not exported from the barrel, and its `Omit<…, 'stage'>` names a field that no longer exists on `DisplayObject`. This also retires charter Open direction #8 (migrate-the-cast) by making it moot. Run `npm run packages:check` after. — review.md › Gaps.
- **Drop the unused `@flighthq/geometry` dependency.** No source file imports it (`Rectangle` comes from `@flighthq/types`). Same hygiene class as the `textlayout` drop already logged in status. Remove from `package.json` and the `tsconfig.json` references. — review.md › Gaps.
- **Add `setBitmapSmoothing` / `setBitmapSourceRectangle` setters.** Both fields are blessed by the 2026-06-25 Decision ("`Bitmap` = `image` + `smoothing` + `sourceRectangle`") but have no mutation path; `Video` already has the `setVideoSmoothing` sibling to mirror. `smoothing` invalidates local content; `sourceRectangle` invalidates local content + local bounds (it drives `computeBitmapLocalBoundsRectangle`). Additive, follows the existing shape. — review.md › Gaps.
- **Fix the `package.json` description drift.** "bitmaps, shapes, text, masks, blend modes" describes the pre-split package; align it with the actual kind set (bitmaps, containers, stages, videos, html/render views). Within-package manifest text, no behavior. — review.md › Contract & docs fit (b).

## Backlog

Parked: cross-package coordination or waiting on an Open direction.

- **Re-land the kept Stage geometry (`scaleMode`, `align`, `contentsScaleFactor`, fullscreen dims).** Blessed by the Decision but parked twice over: the fields live in `@flighthq/types` `StageData` (cross-package), and the no-unhonored-data lean (charter Open direction #2) suggests landing them with at least one consuming backend pass. — review.md › Gaps + Charter contradictions.
- **Emit or relocate `onFullscreenChanged` / `onOrientationChanged`.** No in-package producer exists; fullscreen/display-state ownership went to `@flighthq/application` per the Decisions, so the emitter shape (application integration vs. moving the signals) is a cross-package call. — review.md › Gaps, Open direction #2.
- **Settle the setter-guard rule and apply it uniformly.** Whether reference-typed setters (`setDisplayObjectClip`, `setBitmapImage`, `setVideoSource`) must short-circuit on identity is a one-line North-star ruling (Open direction #3); the mechanical sweep follows it. Parked only on that ruling — trivial once decided.
- **Update the Package Map line for `@flighthq/displayobject`.** Still says "bitmaps, shapes, containers, masks, stages, and videos"; shared admin doc, outside this cell's sweep boundary. Carried forward from the 2026-06-24 assessment. — review.md › Contract & docs fit (b).
- **Charter prose reconciliation.** North star #3/#5 and the Boundaries "In scope" list still describe the pre-Decision bundle surface (`HasCacheAsBitmap`, `Loader`, compositing hints). The charter is the user's file; queue for the next direction pass. — review.md › Charter contradictions.

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._
