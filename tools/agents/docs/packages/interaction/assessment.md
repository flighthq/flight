---
package: '@flighthq/interaction'
updated: 2026-06-24
basedOn: ./review.md
---

# interaction — Assessment

Sorts the `review.md` gaps and the absorbed Bronze/Silver/Gold roadmap (`reviews/maturation/depth/interaction.md`) into sweep-safe **Recommended** and parked **Backlog**. Most of the roadmap's Bronze tier and nearly all of Silver already **landed** in the reviewed pass (shape-accurate `shapeFlag` picking, real tilemap/quad-batch sub-index resolvers, `registerDefaultHitTestPoints`, the traversal-order comment, per-node gating, `hitArea` proxy, the overlap family, the `CursorBackend` seam, `suppressTouchHover`) — so they are not re-listed here. What remains is a short within-package cleanup set plus a larger backlog that is gated on neighbor packages or on an unblessed charter decision.

The prior roadmap (`reviews/maturation/depth/interaction.md`) is now fully absorbed and can be removed as one-time seed.

## Recommended

Sweep-safe: within `@flighthq/interaction`, no cross-package coupling, no breaking change, no open design decision.

- **Remove the stale `@flighthq/scene` dependency.** Listed in `package.json` dependencies and `tsconfig.json` references but never imported by any source or test (only the words "scene graph" in comments). `npm run packages:check` polices workspace dependency conventions and would likely flag it. Pure manifest/tsconfig cleanup, no behavior change. — review.md#contract--docs-fit
- **Fix the `createWebCursorBackend` doc-string mismatch.** `CursorBackend.setCursor` returns `void`, but the `Cursor.ts` doc-comment claims the backend "returns a disposer that restores the previous cursor." No disposer exists. Correct the comment to match the `void` signature. (Adding a real disposer is a type-shape design call → Backlog.) — review.md#contract--docs-fit
- **Widen the overlap family to graph-feature aliases.** `hitTestDisplayObjects`, `containsDisplayObject`, `getDisplayObjectOverlapRectangle`, and `hitTestDisplayObjectsShape` are typed against concrete `DisplayObject` but operate purely on node-level world bounds / parent links. The codebase-map "Scene Graph" rule already mandates graph-feature aliases (`BoundsNode`/`Spatial2DNode`) for reusable graph APIs — `spatialQuery.ts` already complies. Widening these parameters is non-breaking (existing `DisplayObject` callers still pass) and lets a sprite-graph node use the family. No new design decision; it applies an existing constraint. — review.md#contract--docs-fit
- **Update the Package Map one-liner for interaction.** The map still reads "hit testing, pointer dispatch, and object overlap detection"; the package now also owns cursor management, per-node interaction gating, hit-area proxies, sub-index picking, and spatial queries. Refresh the description to match the realized surface. Doc-only, within this tree. — review.md#contract--docs-fit

## Backlog

Parked: gated on a neighbor package, on an unblessed charter decision, or larger than a sweep.

- **Bitmap alpha-threshold picking.** `defaultBitmapHitTestPoint` ignores `shapeFlag` (bounds-only). Genuinely gated on `@flighthq/surface` exposing a pixel-alpha accessor (`getImageSourcePixelAlpha` preferred over inline pixel logic). Cross-package — not actionable in-package. — review.md#gaps
- **Glyph-box text picking and `getTextHitCaretIndex`.** `defaultTextHitTestPoint` / `…RichText` / `…TextInput` are bounds-only; caret hit-testing needs per-glyph rects from `@flighthq/textlayout`. Cross-package coordination. — review.md#gaps
- **True shape-vs-shape overlap (SAT) for `hitTestDisplayObjectsShape`.** Today's cross-center + AABB is an honestly-documented approximation; transformed/rotated convex SAT needs a convex-hull/SAT primitive the roadmap places in the shared geometry crate (reused by the Rust port). Pulls in a cross-package geometry primitive — larger than a within-package sweep. — review.md#gaps
- **Opt-in spatial broadphase (`SpatialIndex`).** Picking and the area queries are full-graph linear DFS per event. An opt-in quadtree/grid is gated on a `SpatialIndex` type contract in `@flighthq/types`, and on whether the index is interaction's concern or a shared scene-graph acceleration structure (structural-fork A). Open direction — route to the charter, do not sweep. — review.md#gaps, open-direction 2
- **Gesture recognition (drag/pan/pinch/swipe/tap/long-press).** Deferred by design to a proposed `@flighthq/interaction-gesture` neighbor. A new-package / boundary decision the charter has not blessed — fails the in-package, no-design-decision bar. Open direction. — review.md#gaps, open-direction 1
- **Mask- and `scrollRect`/viewport-clipped picking.** A masked or clipped node still reports hits across its full bounds. Newly plausible now that `@flighthq/clip` is a real package, but it reaches into clip geometry — cross-package and an open boundary question. Open direction. — review.md#gaps, open-direction 3
- **`hitArea`-proxy detailed sub-index coordinate semantics.** `findGraphHitTargetDetailed` computes the sub-index in the source node's local space using the source node's kind, while the proxy drove only the boolean hit — the local-coordinate semantics across a proxy are unspecified. Needs a spec/design decision on proxy coordinate space before a fix, so it is not a blind sweep. — review.md#gaps
- **`CursorBackend`: module-singleton vs. per-manager.** The current singleton is fine for one canvas; multi-canvas would want per-manager. A posture the charter should pick. Open direction. — open-direction 4
- **Whether `shapeFlag` should ship on kinds that do not yet honor it (bitmap/text).** Uniform signature (consistency) vs. omit-until-supported. A charter call, not a sweep. Open direction. — open-direction 5

## Approved

_None. Approval is the user's verbal gate; nothing frozen yet._

## Notes for the charter's Open directions

These are design forks / cross-package items surfaced by the review for an explicit conversation — to be folded into `charter.md › Open directions`, not edited here:

1. **Gesture boundary** — does interaction own drag/pinch/swipe, and if so as `@flighthq/interaction-gesture` or in-package? (review open-direction 1)
2. **Broadphase home** — is a `SpatialIndex` interaction's concern or a shared scene-graph acceleration structure? (structural-fork A; review open-direction 2)
3. **Clip/mask-aware picking** now that `@flighthq/clip` exists — does interaction reach into clip geometry or does the node expose it? (review open-direction 3)
4. **Cursor backend** module-singleton vs. per-manager (multi-canvas posture). (review open-direction 4)
5. **`shapeFlag` uniformity** — keep it on unsupported kinds for a consistent signature, or omit until the gated packages land? (review open-direction 5)
