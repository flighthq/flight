# Maturation Roadmap: @flighthq/interaction

**Current verdict:** Solid — 68/100. A genuinely deep pointer-dispatch layer bolted to a placeholder, bounding-box-only hit-tester (`shapeFlag` is dead wiring; tilemap/quad-batch are `// TODO` stubs).

The dispatch half is near-done; the hit-testing half is where almost all the maturation work lives, plus a small overlap family, gating, cursor, and (later) acceleration and a separate gesture neighbor package. Types go in `@flighthq/types` first in every tier.

## Bronze

The minimum to make the package honest: shape-accurate picking for the kinds that need it most, real tilemap/quad-batch picking, and a one-call registrar. This removes the two clearest unfinished-by-omission signals.

- **Honor `shapeFlag` for the two kinds that define it.**
  - `defaultShapeHitTestPoint` — implement path/fill containment (even-odd + non-zero winding) against the shape's `ShapeCommand`/`ShapeFillRegion` geometry in local space, after the existing world→local inverse. Bounds test remains the `shapeFlag === false` fast path.
  - `defaultBitmapHitTestPoint` — alpha-threshold test: sample the bitmap's `ImageSource` at the local pixel and compare alpha against a threshold. Add `bitmapHitTestAlphaThreshold` to the bitmap descriptor or thread a default (1) through the hit function.
  - Add the core primitive `containsPathPoint(path: Readonly<Path>, x: number, y: number, fillRule: FillRule): boolean` and a `FillRule` string-kind ('evenOdd' | 'nonZero') in `@flighthq/types` (geometry/path is the natural home for the primitive; the type belongs in the header). This is the reusable engine both shape hit-testing and any future masking reuse.
- **Replace the tilemap/quad-batch TODO stubs with real sub-index picking.**
  - `defaultTilemapHitTestPoint` — local point → tile cell; report a hit only when the cell is populated (non-empty tile id), respecting tile-level transparency where the tileset carries it.
  - `defaultQuadBatchHitTestPoint` — local point → per-quad AABB test over the batch's quad rects.
  - Add `HitTestResult` to `@flighthq/types` carrying `{ node, subIndex, localX, localY }` and `findGraphHitTargetDetailed(source, x, y, shapeFlag, out: HitTestResult): boolean` so callers can learn _which_ tile/quad was hit, not just the node. (`subIndex = -1` sentinel when the kind has no sub-index.)
- **`registerDefaultHitTestPoints(): void`** — one opt-in registrar that wires the whole built-in bank (still side-effect-free, still tree-shaken when unused), closing the "register every kind by hand" usability gap noted in the review.
- **Remove the alias-semantics footgun:** document on `hitTestGraphPoint` why it traverses natural child order while `findGraphHitTarget` traverses reverse (front-to-back), so a future "fix" cannot silently break picking.
- **Tests** for each newly-honored `shapeFlag` path (point inside fill vs inside-bounds-outside-fill, concave shape, alpha-hit vs transparent-pixel-miss, tile populated vs empty, quad index resolution).

## Silver

Competitive with OpenFL/Pixi: per-object interaction gating, hit-area delegation, the full overlap family, cursor management, and `pointerType` semantics. This is the tier where the package behaves like the OpenFL model it already tracks.

- **Per-object interaction gating (the `mouseEnabled`/`mouseChildren` analogue).** Define in `@flighthq/types` as runtime-slot booleans read during traversal, not new entity fields:
  - `setNodeInteractive(node, enabled)` / `isNodeInteractive(node)` — node opts out of _self_ hit (container stays pickable through children).
  - `setNodeChildrenInteractive(node, enabled)` / `areNodeChildrenInteractive(node)` — subtree opts out while the node itself stays pickable.
  - `findGraphHitTarget`/`hitTestGraphPoint` consult both; this is distinct from the existing `enabled` flag (which kills the whole subtree).
- **`hitArea` delegation.** `setNodeHitArea(node, area: Readonly<NodeAny> | Readonly<Rectangle> | null)` / `getNodeHitArea(node)` (runtime slot). When set, the node's hit test delegates to the proxy region (invisible larger touch targets, simplified proxy shapes). Define a `HitArea` union in the header.
- **Overlap family beside `hitTestDisplayObjects`** (all `out`-free booleans / value returns):
  - `hitTestDisplayObjectPoint(source, worldX, worldY, shapeFlag): boolean` — the public point-vs-object world-coord entry that the review flags as missing.
  - `hitTestDisplayObjectsShape(source, other): boolean` — transformed (rotated/skewed) shape-vs-shape overlap via SAT on the objects' convex world hulls, not AABB.
  - `containsDisplayObject(outer, inner): boolean` — full-containment query.
  - `getDisplayObjectOverlapRectangle(source, other, out: Rectangle): boolean` — the intersection rect, sentinel `false` when disjoint.
- **Cursor management** (folded into interaction by both OpenFL `buttonMode`/`useHandCursor` and Pixi `cursor`):
  - `Cursor` string-kind set in `@flighthq/types` ('default' | 'pointer' | 'move' | 'text' | 'grab' | 'grabbing' | 'notAllowed' | …).
  - `setNodeCursor(node, cursor: Cursor | null)` / `getNodeCursor(node)` (runtime slot).
  - A swappable **`CursorBackend`** seam in `@flighthq/types` with `getCursorBackend`/`setCursorBackend`/`createWebCursorBackend` (web backend sets `canvas.style.cursor`); the manager resolves the cursor of the current rollover target through the active backend. Web default lazily available; native hosts register their own — matching the platform-suite backend pattern.
- **`pointerType` semantics:** `InteractionManagerOptions.suppressTouchHover` (default true) so touch pointers do not synthesize rollover/over chains; branch on `_pointerData.pointerType` in `dispatchInteractionPointerMove`.
- **Cross-backend consistency:** confirm hit results are identical whether coordinates arrive from Canvas, DOM, or WebGL render targets (the `coordScale` path already exists; add a functional test exercising shape-accurate picking across the raster backends).
- **Tests** for gating combinations, hitArea proxy/rect, each overlap function (including aliased `out`), cursor resolution through a fake backend, and touch-hover suppression.

## Gold

Authoritative: spatial acceleration, a gesture/drag neighbor package, exhaustive edge handling, and 1:1 Rust parity.

- **Spatial acceleration (broadphase) as an opt-in path**, not a default. Define in `@flighthq/types`:
  - A `SpatialIndex` contract with `createQuadtreeSpatialIndex(bounds, options)` / `createGridSpatialIndex(cellSize)` (allocators), `insertSpatialIndexNode` / `removeSpatialIndexNode` / `updateSpatialIndexNode`, and `querySpatialIndexPoint(index, x, y, out: NodeAny[])` / `querySpatialIndexRectangle`.
  - `InteractionManagerOptions.spatialIndex` so `findInteractionTarget` consults the broadphase to prune candidates, falling back to the linear DFS for fine picking. Keeps O(n) DFS as the zero-config default; large scenes opt into O(log n).
  - Dirty-region invalidation hook tied to node bounds invalidation so the index stays coherent without a full rebuild per frame.
- **Drag/gesture as a focused neighbor package, `@flighthq/interaction-gesture`** (the documented scope decision — interaction owns routing, gestures are a layer on top):
  - Drag: `createDragController(node, options)` with `onDragStart`/`onDrag`/`onDragEnd` signals (enabled via `enableDragSignals`), drag thresholds, bounds clamping, and drop-target resolution reusing the overlap family.
  - Recognizers: tap, double-tap, long-press, pan, pinch (`scale`), rotate, swipe (`velocity`/direction) — each a `create*Recognizer` over multi-pointer state, emitting plain-data gesture payloads defined in `@flighthq/types`.
  - Pointer-history/velocity tracking on `InteractionPointerState` for swipe/fling.
- **Exhaustive hit-test coverage / edge handling:**
  - Shape hit-testing honoring stroke width (hit on a thick line that has no fill), miter/round caps, and Bézier/quadratic segment containment (not just polygon approximation).
  - Glyph-box text hit-testing (`defaultTextHitTestPoint` honoring `shapeFlag` against laid-out glyph rects from `@flighthq/textlayout`), plus a `getTextHitCaretIndex(node, x, y): number` for text-edit caret placement (sentinel `-1`).
  - Mask-aware picking: a node clipped by a mask reports a hit only inside the mask region.
  - `scrollRect`/viewport clipping respected in the traversal.
  - Filter-expanded bounds vs geometry bounds: pick against geometry, not the blur-inflated bounds.
- **Performance:** zero-allocation hot path (all scratch via module pools — already partly done), `out`-param everywhere, and a benchmark gate for picking against a 10k-node scene with and without the spatial index.
- **Docs & functional tests:** a complete interaction functional scene (nested gating, hitArea proxy, shape-accurate vs bounds picking, cursor changes, drag-and-drop) captured with a screenshot baseline; an examples app demonstrating the full event model.
- **1:1 Rust parity** in `flighthq-interaction` (and `flighthq-interaction-gesture`): the registry as `HashMap<KindId, _>`, free functions over `(&mut NodeArena<T>, NodeId)`, `Option`/`-1` sentinels, the `containsPathPoint`/SAT primitives shared with the shape/geometry crates, and conformance scenes paired by name with the TS functional tests. The cursor `CursorBackend` follows the host backend-seam pattern (native default in-crate, web fill in `host-web`).

## Sequencing & effort

1. **Bronze first, in this order** (each is self-contained and high-value):
   - `containsPathPoint` + `FillRule` (header) → `defaultShapeHitTestPoint`. _Largest single Bronze item; the geometry primitive is reusable and worth getting right._ **Depends on** `@flighthq/types` (FillRule), `@flighthq/geometry`/path access to `Path`/`ShapeCommand`.
   - `defaultBitmapHitTestPoint` alpha test. **Depends on** bitmap `ImageSource` pixel read (`@flighthq/surface` or displayobject bitmap accessor) — _surface a decision: does interaction read pixels directly, or does `@flighthq/surface` expose a `getImageSourcePixelAlpha` helper?_ Prefer the latter to keep interaction free of pixel-buffer logic.
   - `HitTestResult` + `findGraphHitTargetDetailed` → tilemap/quad-batch sub-index picking. **Depends on** `@flighthq/sprite` tilemap/quad-batch internals (already a devDependency).
   - `registerDefaultHitTestPoints` + traversal-order comment. Trivial.
2. **Silver** builds directly on Bronze's honored `shapeFlag`:
   - Gating (`isNodeInteractive`/`areNodeChildrenInteractive`) and `hitArea` are pure traversal changes in `hitTests.ts` — low effort, do together. **Header types first.**
   - Overlap family — moderate; SAT hull code is the only non-trivial piece, reusable from a geometry primitive.
   - Cursor management — moderate; introduces the **`CursorBackend` seam (cross-package design item: confirm it lives in `@flighthq/types` like the other platform backends, and whether the web backend ships here or in a host package).**
3. **Gold** is the genuine frontier and should be split:
   - Spatial index — significant, but isolated behind an opt-in option; build after Silver since it must respect gating/hitArea.
   - **`@flighthq/interaction-gesture` is a new package — a design decision to surface to the user** (the review explicitly calls gestures _missing-by-design unless the SDK intends interaction to own them_). Recommend a focused `-gesture` neighbor (mirrors the `-formats`/`-subpackage` pattern) so the base package stays a pure router and gestures tree-shake independently.
   - Glyph/text hit-testing **depends on `@flighthq/textlayout`** exposing per-glyph rects; coordinate with that package.
   - Rust parity is the last gate, after the TS shape stabilizes.

**Cross-package / design items to surface before starting:**

- Pixel read for bitmap alpha hit-testing: add to `@flighthq/surface` rather than inline pixel logic in interaction.
- Whether the `CursorBackend` web default ships in `interaction` or a host package.
- Whether gestures/drag become a `@flighthq/interaction-gesture` neighbor (recommended) vs living in this package.
- Whether `shapeFlag` should be temporarily removed from the public surface if Bronze shape/bitmap support slips — the review flags it as advertising a capability that does not yet exist.
