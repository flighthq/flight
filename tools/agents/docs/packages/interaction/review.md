---
package: '@flighthq/interaction'
status: solid
score: 84
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/interaction.md
  - source
---

# interaction — Review

## Verdict

**solid — 84/100.** Both halves of the package are now real. The pointer-dispatch layer was already deep (bubbling, cancellation, rollover-chain diffing, click/double-click, releaseOutside, multi-pointer, capture, lazy subscriber-gated dispatch); this pass brought the hit-testing layer up to nearly match it — shape-accurate picking (`shapeFlag` is now honored for shapes), per-tile/per-quad sub-index picking, a `hitArea` proxy, `mouseEnabled`/ `mouseChildren` gating, cursor management with a backend seam, an overlap family, spatial queries, and a one-call default registrar. The remaining gaps are real but mostly gated on neighbor packages (bitmap alpha picking → `surface`; glyph caret → `textlayout`) or are explicitly deferred design decisions (gesture subpackage, spatial broadphase). The score is held below the worker's claimed 91 by a stale unused dependency, a couple of type-precision slips against the graph-feature-alias rule, and a thin-charter risk that nothing yet pins the package's intended boundary against a future `interaction-gesture`.

The status doc's headline claims were verified against source: shape `shapeFlag` (true winding test via `getShapeFillRegions` + `containsPathPoint`), tilemap/quad sub-index resolvers, cursor backend seam, touch-hover suppression, overlap family, and spatial queries all exist as described and are tested (166 `it()` across 8 test files).

## Present capabilities

**Hit testing (`hitTests.ts`).** `findGraphHitTarget` front-to-back DFS with a documented reverse-order comment; `hitTestGraphPoint` natural-order any-hit, also documented as to why the orders differ — closing the depth review's "undocumented why they differ" note. `findGraphHitTargetDetailed` fills a `HitTestResult` out-struct (`node`, `localX`, `localY`, `subIndex`). `registerHitTestPoint` / `registerHitTestDetailed` are open string-keyed registries (`Map<Kind, …>`), the correct tree-shakable shape. Per-node gating — `setNodeInteractive`/`isNodeInteractive` (mouseEnabled) and `setNodeChildrenInteractive`/`areNodeChildrenInteractive` (mouseChildren) — and a `hitArea` proxy (`setNodeHitArea`/`getNodeHitArea`) over the `HitArea = Rectangle | NodeAny` union, all stored in a single `WeakMap`-backed `NodeInteractionState`. This directly answers depth-review gaps "no hitArea override" and "no per-object interaction gating."

**Shape-accurate picking (`displayHitTests.ts`).** `defaultShapeHitTestPoint` now branches on `shapeFlag`: bounds early-reject, then `getShapeFillRegions` + `containsPathPoint` winding-number test per fill region, with an honest documented fallback to bounds for gradient/bitmap/stroke fills (where `getShapeFillRegions` returns null). The depth review's central "dead `shapeFlag` wiring" finding is resolved for shapes.

**Sprite-family picking (`spriteHitTests.ts`).** The two former `// TODO` kinds are real: `defaultTilemapHitTestPoint` resolves to the populated tile (`tiles[row*columns+col] >= 0`, empty tiles transparent to picking) and `defaultQuadBatchHitTestPoint` defers to `hitTestQuadBatchPointXY` per quad. Both expose sub-index resolvers (`resolveTilemapHitSubIndex`, `resolveQuadBatchHitSubIndex`) wired through `registerDefaultSpriteHitTestDetailedResolvers`.

**Overlap family (`displayObjectOverlap.ts`).** Beside the existing `hitTestDisplayObjects` (AABB), three new entries: `containsDisplayObject` (full enclosure), `getDisplayObjectOverlapRectangle` (out-param intersection rect, alias-safe via `computeRectangleIntersection`), and `hitTestDisplayObjectsShape` (cross-center approximation with documented limits and a pointer to `findGraphHitTarget(shapeFlag=true)` for exactness). Answers the "overlap detection is AABB-only" gap with the small family the depth review asked for.

**Cursor management (`cursor.ts`).** `CursorBackend` seam + `setCursorBackend`/`getCursorBackend`, `createWebCursorBackend` (CSS), per-node `setNodeCursor`/`getNodeCursor` in a `WeakMap`, and `setCursor`. The manager's `dispatchPointerRolloverChange` resolves the cursor innermost-first (`resolveRolloverCursor`) and applies it on rollover change — and the move path now runs even with no signal subscribers when a cursor backend is active. This is the depth review's "no cursor management" gap, closed with the platform-suite backend-seam pattern.

**Spatial queries (`spatialQuery.ts`).** `hitTestAreaQuery` (rect) and `hitTestAreaQueryCircle` (nearest-point-on-AABB) collect intersecting enabled nodes front-to-back into an optional out array. Honestly documented as linear O(n) and as the future entry points for an opt-in broadphase.

**Manager (`interactionManager.ts`).** Unchanged strengths plus: `suppressTouchHover` (default `true`) suppresses synthesized rollover for touch pointers — answering the depth-review "no touch-vs-mouse semantics" note — and cursor application woven into the rollover path. The lazy `isPointerSignalNeeded` / `hasInteractionSignalSubscriber` gating, per-pointer capture, bubbling with cancellation, and `connectInputToInteraction` (the `@flighthq/input` seam) remain.

**Types-first (`@flighthq/types`).** New shared types `HitTestResult`, `HitArea` (in `NodeInteraction.ts`), `Cursor`/`CursorBackend`, and `HitTestFunction`; `InteractionManager` gained `suppressTouchHover`/`trackedSubscribersOnly`. All cross-package types live in the header layer, per the contract.

## Gaps

- **Bitmap alpha-threshold picking is still bounds-only.** `defaultBitmapHitTestPoint` ignores `shapeFlag`. Genuinely gated on `@flighthq/surface` exposing a pixel-alpha accessor; a real gap for an authoritative hit-tester but not actionable in-package.
- **Text picking is bounds-only; no caret index.** `defaultTextHitTestPoint` / `...RichText` / `...TextInput` ignore `shapeFlag`. Glyph-box picking and a `getTextHitCaretIndex` are gated on `@flighthq/textlayout` exposing per-glyph rects. For a package that owns `textinput`'s neighbor surface, caret hit-testing is a notable absence.
- **No gesture recognition.** Drag/pan/pinch/swipe/tap/long-press. Deferred by design to a proposed `@flighthq/interaction-gesture` subpackage (not yet blessed — see open directions).
- **No spatial broadphase.** Picking and the area queries are full-graph linear DFS every event. An opt-in `SpatialIndex` (quadtree/grid) is gated on a `SpatialIndex` type contract in `@flighthq/types`. Acceptable as the zero-config default; a mature picking library offers the acceleration path.
- **`hitTestDisplayObjectsShape` is an approximation, not true shape overlap.** Cross-center + AABB is documented honestly, but transformed/rotated convex shape-vs-shape (SAT) is absent.
- **Mask-aware and `scrollRect`/viewport-clipped picking absent.** A node clipped by a mask or scroll rect still reports a hit across its full bounds. With `@flighthq/clip` now a real package, clip-region-aware picking is a newly-plausible neighbor capability.
- **`findGraphHitTargetDetailed` sub-index over a `hitArea` proxy is computed in the source node's local space using the source node's kind** (the proxy is only consulted for the boolean hit, then `hit.kind`/source-local coords drive the detailed resolver). Edge case, but the local-coordinate semantics across a proxy are unspecified.

## Charter contradictions

None — the charter (`What it is` / `North star` / `Boundaries` / `Decisions`) is entirely a `TODO` stub, so there is no stated principle to contradict. This is itself the highest-leverage finding: the package's boundary against gestures, broadphase, and clip-aware picking is being decided implicitly in status notes rather than blessed in the charter. Every "deferred by design" item below is a boundary the charter should ratify or reject. (See candidate open directions.)

## Contract & docs fit

**Lives up to the contract:**

- **Types-first, full unabbreviated names, sentinels-not-throws** — `findGraphHitTarget` returns `null`, sub-index resolvers return `-1`, no throws on expected-failure paths. Names carry the full type word (`findGraphHitTargetDetailed`, `hitTestDisplayObjectsShape`, `getNodeCursor`). `is*`/`has*`/`are*` predicate prefixes, `register*` for registries, `set*`/`get*` accessors, `enable*` for the signal opt-in — all correct.
- **Out-params & alias-safety** — `getDisplayObjectOverlapRectangle` writes `out` and is alias-safe; `findGraphHitTargetDetailed` fills a `HitTestResult` out-struct; the area queries append to an optional out array.
- **Single root export, `sideEffects: false`, registry-by-default** — `index.ts` is a thin barrel; manifest declares `sideEffects: false`; registration is opt-in via `registerDefaultHitTestPoints` / `registerHitTestPoint`, never at module top level. Open string registries, not closed `switch(kind)` — matches structural-fork B exactly.
- **Backend seam** — `CursorBackend` + `set*Backend`/`get*Backend`/`createWeb*Backend` mirrors the platform-suite command-capability shape (structural-fork D); the Rust conformance map already records relocating the web backend to `host-web`.

**Candidate revisions (the contract/admin docs or manifest are off):**

- **Stale unused dependency: `@flighthq/scene`.** It is listed in `package.json` dependencies and referenced in `tsconfig.json`, but **never imported** by any source or test file (the only "scene" hits are the words "scene graph" in comments). `npm run packages:check` polices workspace dependency conventions and would likely flag this — it should be removed.
- **Type precision vs. the graph-feature-alias rule.** `hitTestDisplayObjects`, `containsDisplayObject`, `getDisplayObjectOverlapRectangle`, and `hitTestDisplayObjectsShape` are typed against `DisplayObject` but operate purely on node-level world bounds / parent links. The codebase-map "Scene Graph" guidance says reusable graph APIs should depend on graph-feature aliases (`BoundsNode`/`Spatial2DNode`), not a concrete graph family — `spatialQuery.ts` already does this (`Spatial2DNode`). The overlap family could be widened to the same aliases so a sprite-graph node can use it.
- **Package Map line is thin.** The map describes interaction as "hit testing, pointer dispatch, and object overlap detection." It now also owns cursor management, per-node interaction gating, hit-area proxies, sub-index picking, and spatial queries — the one-liner understates the package and predates the cursor/gating surface.
- **`createWebCursorBackend` doc-string claim mismatch.** `CursorBackend.setCursor` returns `void`, but the `Cursor.ts` doc-comment says the backend "returns a disposer that restores the previous cursor." No disposer exists. Doc should match the `void` signature (or the type should add the disposer — a small design call).

## Candidate open directions

These are questions the stub charter does not answer that this review had to assume:

1. **Where is the gesture boundary?** Status proposes a separate `@flighthq/interaction-gesture` (`-subpackage` pattern) so the base stays a pure router. Bless or reject: does interaction own drag/pinch/swipe at all, and if so as a neighbor or in-package?
2. **Does broadphase live here?** A `SpatialIndex` seam on `InteractionManagerOptions` is gated on a `@flighthq/types` contract. Is the spatial index interaction's concern, or a shared scene-graph acceleration structure other packages (culling, queries) also consume? This is an instance of structural-fork A (source-data/simulation vs. graph participation).
3. **Clip/mask-aware picking now that `@flighthq/clip` exists.** Should a masked or `scrollRect`-clipped node report hits only inside its clip region, and does interaction reach into clip geometry or does the node expose it?
4. **Cursor backend: module singleton vs. per-manager.** Status records the singleton choice and flags multi-canvas as the case that would want per-manager. The charter should pick the intended multi-canvas posture.
5. **Should `shapeFlag` ship on text/bitmap kinds before they honor it?** The depth review argued a parameter should not advertise a capability the package lacks. It is now honored for shapes; bitmap/text still ignore it. Charter could state whether the uniform signature is intentional (consistency) or whether unsupported kinds should omit it until gated packages land.
