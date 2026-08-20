---
package: '@flighthq/interaction'
updated: 2026-08-08
by: principal
---

# interaction — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against `packages/interaction/src/` on 2026-08-08. A file:line here is a
claim about this tree, not about a session.

- **QuadBatch and Tilemap hit-test to the whole node's bounds.** `defaultQuadBatchHitTestHandler`
  (`spriteHitTests.ts:5`) and `defaultTilemapHitTestHandler` (`:13`) both delegate straight to
  `defaultSpriteHitTestHandler`, so a pointer in a gap between quads or on an empty tile still hits.
  No precise resolver is registered for either kind — `registerSpriteHitTest` covers `SpriteKind`
  alone (`registerSpriteHitTest.ts:19`) — so `describeGraphHit`'s `subIndex` never carries a quad
  instance or a tile index.
- **Masking and `scrollRect` are not honoured in traversal.** Neither string appears anywhere in
  `packages/interaction/src`; a node clipped by a mask or a viewport still reports hits outside the
  clipped region. Needs the mask/clip geometry reachable from the node at hit-test time.
- **`hitTestNode2DsShape` is not a shape test.** It is AABB rejection followed by a cross-center
  check — is either world-bounds center inside the other's box (`displayObjectOverlap.ts:19-27`).
  Documented, but the name promises more than it does; `findGraphHitTargetPrecise` is the exact path.
- **Pointer mapping scales but does not translate.** `connectInputToInteraction` multiplies
  `coordScale` into each coordinate and assumes they are already canvas-local
  (`interactionManager.ts:49-52`); a canvas away from the viewport origin needs the bounding-rect
  offset subtracted per event upstream, and that rect moves with scroll and layout. The opt-in
  `mapDomPointerEventToElement` helper that would fold both gotchas together is deliberately unbuilt.
- **No gesture recognizers** — drag, pan, pinch, swipe, tap, long-press. Whether they become an
  `interaction-gesture` neighbor (keeping this package a pure router) is a design ruling, not effort.
- **Zero functional-scene coverage.** No functional scene imports `@flighthq/interaction`. Four
  interaction bounds consumers — hit testing, overlap, focus manager, spatial index — all read shape
  bounds via `getNodeWorldBoundsRectangle`. Without `registerDefaultShapeBoundsCommands()`, those
  bounds are zero, producing silent no-ops: clicks pass through, overlaps always false, focus rects
  zero-area, spatial index entries zero-width. Because the GL/Canvas shape *renderer* works fine
  without bounds registration, a scene that looks correct visually may have an interaction layer
  silently doing nothing. No picture reveals it.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. Three standing gaps checked out
  **false**: "spatial index broadphase — not started" is closed by `interactionSpatialIndex.ts` plus
  the `spatialIndex` manager option (`interactionManager.ts:141`, `:499`); "bitmap alpha-threshold
  hit testing, gate is `@flighthq/bitmap`" is closed by `registerSpriteHitTest.ts` reading
  `getBitmapPixelChannel`; "glyph-box text hit-testing + caret index, gate is `@flighthq/textlayout`"
  is closed by `registerTextHitTest.ts`. The 2026-06-25 note that this worktree lacks `Cursor.ts` and
  `spatialQuery.ts` is likewise stale — both exist, as `cursorBackend.ts` and `spatialQuery.ts`.
- **2026-08-02** — `MorphShapeKind` registered with the Shape handler in `registerDefaultHitTests`
  and with the live fill-region handler in `registerShapeHitTest`.
- **2026-07-09** — Pointer coordinate-space contract documented on `connectInputToInteraction` after
  high-DPI examples mis-rendered by taking the default `coordScale = 1`.
- **2026-07-03** — Inline TODOs relocated out of `spriteHitTests.ts` under the `no-warning-comments`
  lint sweep.
- **2026-06-25** — Stale `@flighthq/scene3d` dependency dropped; the node-overlap entry point widened
  from `DisplayObject` to the `Spatial2DNode` graph-feature alias.
- **2026-06-24** — Hit-test registry, shape-accurate picking via `containsPathPoint`, hit-area proxy
  delegation, cursor backend seam, the overlap family, and the area queries landed.
