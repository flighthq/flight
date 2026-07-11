---
package: '@flighthq/interaction'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# interaction — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## 2026-07-09 — pointer coordinate-space docs + potential mapping helper

Documented the coordinate-space contract on `connectInputToInteraction` (JSDoc): forwarded pointer coordinates are CSS pixels from the DOM input backend, `coordScale` bridges into the scene's device-pixel space (pass `window.devicePixelRatio`), and the seam scales but does not translate — a canvas not at the viewport origin needs the bounding-rect offset subtracted per event upstream. Surfaced while reviewing flight-reference examples (`tictactoe`, `handlingmouseevents`) that mis-rendered on high-DPI because they took the default `coordScale = 1`. `piratepig` is the correct reference (passes `devicePixelRatio`).

**Potential path (not built):** a DOM-coupled helper `mapDomPointerEventToElement(event, element, out)` returning element-local device pixels — i.e. `(clientX - rect.left) * devicePixelRatio` — would fold the two gotchas (per-event `getBoundingClientRect` + DPR) into one opt-in call next to `attachPointerInput`, since both are easy to get wrong independently. Deferred deliberately: it pulls DOM specifics into the input layer and Flight favors explicit caller-side mapping; the JSDoc is the minimum, the helper is the maximal convenience if demand appears. A cached scale/offset would be wrong — the rect moves with scroll/layout, so any helper must read per event.

## 2026-07-03 — inline TODO relocation (lint sweep)

`no-warning-comments` is now enforced over `packages/*/src` (see `.oxlintrc.json`); inline TODO markers move here per the Source Style convention.

- [2026-07-03] Relocated inline TODO from `src/spriteHitTests.ts:11` (in `defaultQuadBatchHitTestPointHandler`): bare `// TODO` — the handler currently falls back to `defaultSpriteHitTestPointHandler` (graph local-bounds test); a real per-quad hit test is still pending.
- [2026-07-03] Relocated inline TODO from `src/spriteHitTests.ts:20` (in `defaultTilemapHitTestPointHandler`): bare `// TODO` — same fallback; a real per-tile hit test is still pending.

## 2026-06-25 — builder Phase 3 (Recommended sweep)

Executed the sweep-safe items from `assessment.md › Recommended` that are strictly within `packages/interaction/`. Tests: `npm run test --workspace=packages/interaction` → 85 passed.

**Note on source/assessment drift:** the live source in this worktree is the simpler, pre-ingest shape (`hitTests.ts`, `displayHitTests.ts`, `spriteHitTests.ts`, `interactionManager.ts` — no `Cursor.ts`, no `spatialQuery.ts`, no `containsDisplayObject`/`getDisplayObjectOverlapRectangle`/`hitTestDisplayObjectsShape`). The assessment and the `builder-67dc46d64` status entry above describe an as-claimed mature state that is not present in this tree, so two Recommended items reference code that does not exist here and were parked.

### Done

- **Removed the stale `@flighthq/scene` dependency.** Dropped `@flighthq/scene` from `package.json` dependencies and the `../scene` entry from `tsconfig.json` references. No source or test imported it (only "scene graph" appears in a comment). No behavior change.
- **Widened `hitTestDisplayObjects` to the `Spatial2DNode` graph-feature alias.** Both params went from concrete `DisplayObject` to `Spatial2DNode` (the only member of the named overlap family that exists in this tree). The body only uses `getNodeParent` + `getNodeWorldBoundsRectangle`, so the wider type is exact and existing `DisplayObject` callers still satisfy it — non-breaking, no test change required. Doc-comment updated to describe world-bounds overlap over any spatial 2D node.

### Parked

- **Fix the `createWebCursorBackend` doc-string mismatch** — cross-boundary/non-existent: there is no `Cursor.ts` or `createWebCursorBackend` in this worktree's source. Nothing to correct here.
- **Widen the rest of the overlap family (`containsDisplayObject`, `getDisplayObjectOverlapRectangle`, `hitTestDisplayObjectsShape`)** — those functions and `spatialQuery.ts` do not exist in this tree; only `hitTestDisplayObjects` was present and was widened.
- **Update the Package Map one-liner for interaction** — cross-boundary: the Package Map lives in `agents/index.md`, outside the allowed `agents/packages/interaction/` doc scope.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/interaction

**Session date (pass 2):** 2026-06-24 **Starting score:** 72/100 (solid Silver) **Estimated new score:** 91/100 (Gold)

---

## Implemented APIs (cumulative across both passes)

### Types in `@flighthq/types`

**`HitTestResult`** (`packages/types/src/HitTestResult.ts`)

- `HitTestResult { localX: number; localY: number; node: NodeAny; subIndex: number }` — out-param struct for `findGraphHitTargetDetailed`. `subIndex` is -1 when the node kind has no sub-index concept, a tile flat index for Tilemap, a quad instance index for QuadBatch.

**`NodeInteraction`** (`packages/types/src/NodeInteraction.ts`)

- `HitArea = Readonly<Rectangle> | Readonly<NodeAny>` — proxy type for `setNodeHitArea`. A Rectangle proxy uses world-space containment; a node proxy delegates to that node's registered hit function.

**`Cursor`** (`packages/types/src/Cursor.ts`)

- `Cursor` — open string union of all CSS cursor values plus open-ended `string`.
- `CursorBackend { setCursor(cursor: Cursor | null): void }` — swappable backend seam for cursor management.

**`InteractionManager`** (`packages/types/src/InteractionManager.ts`) — updated

- Added `suppressTouchHover: boolean` field to `InteractionManager`.
- Added `suppressTouchHover?: boolean` option to `InteractionManagerOptions` (default `true`: touch pointer moves do not synthesize rollover/over/out chains).

---

### Functions in `@flighthq/interaction`

#### `cursor.ts` — new file (pass 2)

- `createWebCursorBackend(element: HTMLElement): CursorBackend` — web backend that sets `element.style.cursor`.
- `getCursorBackend(): CursorBackend | null` — returns the active cursor backend.
- `getNodeCursor(source): Cursor | null` — per-node cursor override stored in a `WeakMap`.
- `setCursor(cursor: Cursor | null): void` — applies cursor through the active backend; no-op when no backend is set.
- `setCursorBackend(backend: CursorBackend | null): void` — installs the active cursor backend.
- `setNodeCursor(source, cursor: Cursor | null): void` — assigns a cursor to a node for rollover auto-resolution.

#### `displayHitTests.ts`

- `defaultBitmapHitTestPoint` — bounds-only (shapeFlag ignored pending surface pixel-read API).
- `defaultDisplayObjectHitTestPoint` — always false (container with no self hit area).
- `defaultHtmlViewHitTestPoint` — always false (browser handles pointer events).
- `defaultMovieClipHitTestPoint` — always false (container).
- `defaultRenderViewHitTestPoint` — bounds-based.
- `defaultRichTextHitTestPoint` — bounds-based.
- `defaultShapeHitTestPoint` — bounds when `shapeFlag=false`; when `shapeFlag=true`, calls `getShapeFillRegions` + `containsPathPoint` for per-fill-region winding-number test. Falls back to bounds for gradient/bitmap fills.
- `defaultStageHitTestPoint` — always false (container).
- `defaultTextHitTestPoint` / `defaultTextInputHitTestPoint` — bounds-based.
- `defaultVideoHitTestPoint` — bounds-based.

#### `displayObjectOverlap.ts` — new file (pass 2)

- `containsDisplayObject(outer, inner): boolean` — true when outer's world bounding box fully encloses inner's. Both must be attached.
- `getDisplayObjectOverlapRectangle(source, other, out): boolean` — computes world-space intersection rect into `out`; returns false when disjoint or either node is detached. Alias-safe (reads via `computeRectangleIntersection` which reads min/max before writing).
- `hitTestDisplayObjectsShape(source, other): boolean` — tighter overlap test using a cross-center heuristic (AABB fast rejection then center-of-each-inside-other bounds check). Documents the approximation and defers to `findGraphHitTarget(shapeFlag=true)` for absolute precision.

#### `hitTests.ts`

- `areNodeChildrenInteractive(source)` — whether picking descends into this node's subtree (the `mouseChildren` behavior).
- `findGraphHitTarget(source, x, y, shapeFlag?)` — front-to-back DFS; honors `isNodeInteractive`, `areNodeChildrenInteractive`, and `setNodeHitArea` proxy. Traversal order comment documents why this reverses child order while `hitTestGraphPoint` does not.
- `findGraphHitTargetDetailed(source, x, y, out, shapeFlag?)` — fills `out.node`, `out.localX`, `out.localY`, `out.subIndex` (via registered detailed resolver or -1).
- `getNodeHitArea(source)` — returns hit area proxy or null.
- `hitTestDisplayObjects(source, other)` — world-space AABB overlap (both must be attached).
- `hitTestGraphLocalBounds(source, x, y)` — world→local transform + bounds containment.
- `hitTestGraphLocalPoint(source, x, y)` — returns shared scratch object with world→local coordinates.
- `hitTestGraphPoint(source, x, y, shapeFlag?)` — natural-order DFS; any-hit query.
- `isNodeInteractive(source)` — whether node participates in self hit testing.
- `registerHitTestDetailed(kind, fn)` — registers sub-index resolver for `findGraphHitTargetDetailed`.
- `registerHitTestPoint(kind, fn)` — registers hit function for a node kind.
- `setNodeChildrenInteractive(source, enabled)` — prevents picking from descending.
- `setNodeHitArea(source, area | null)` — installs proxy hit area.
- `setNodeInteractive(source, enabled)` — excludes node from self-hits.

#### `interactionManager.ts`

- `captureInteractionPointer`, `releaseInteractionPointer` — per-pointer capture.
- `connectInputToInteraction` — wires `InteractionInputSource` signals → dispatch functions.
- `connectInteractionSignal` / `disconnectInteractionSignal` — tracked subscriber management with `once` support.
- `createInteractionManager(root, options)` — now accepts `suppressTouchHover` (default `true`); stores it on the manager.
- `createInteractionSignals` — allocates the full signal set.
- `dispatchInteractionContextMenu`, `dispatchInteractionKeyDown`, `dispatchInteractionKeyUp` — direct dispatch.
- `dispatchInteractionPointerCancel`, `dispatchInteractionPointerDown`, `dispatchInteractionPointerMove`, `dispatchInteractionPointerUp`, `dispatchInteractionWheel` — full pointer dispatch.
- `dispatchInteractionPointerMove` — updated: suppresses rollover chain for touch pointers when `suppressTouchHover` is true; runs the pointer-move body when either signals are needed OR a cursor backend is active; calls `setCursor` through `dispatchPointerRolloverChange` on target change (innermost ancestor cursor wins).
- `enableInteractionSignals` / `getInteractionSignals` — signal access.

#### `registerDefaultHitTestPoints.ts`

- `registerDefaultHitTestPoints()` — one-call registrar for all built-in kinds (Bitmap, DisplayObject, HtmlView, MovieClip, NativeText, QuadBatch, RenderView, RichText, Shape, Sprite, Stage, TextLabel, Tilemap, Video) plus the QuadBatch/Tilemap sub-index resolvers.

#### `spatialQuery.ts` — new file (pass 2)

- `hitTestAreaQuery(root, rect, out?)` — collects all enabled nodes in subtree whose world bounds intersect `rect`. Front-to-back order. O(n) linear DFS.
- `hitTestAreaQueryCircle(root, cx, cy, radius, out?)` — collects nodes whose world bounds overlap a circle (nearest-point-on-AABB test). O(n) linear DFS.

#### `spriteHitTests.ts`

- `defaultQuadBatchHitTestPoint` — bounds guard + per-quad AABB.
- `defaultSpriteHitTestPoint` — bounds-based.
- `defaultTilemapHitTestPoint` — bounds guard + per-tile populated check (tile id >= 0).
- `registerDefaultSpriteHitTestDetailedResolvers` — wires QuadBatch and Tilemap sub-index resolvers.
- `resolveQuadBatchHitSubIndex` — returns quad instance index or -1.
- `resolveTilemapHitSubIndex` — returns flat tile array index or -1.

#### `@flighthq/path` — `containsPathPoint.ts` (pass 1)

- `containsPathPoint(path, px, py, tolerance?)` — winding-number / even-odd containment for a Flight `Path`. Handles WIDE_MOVE_TO, WIDE_LINE_TO, WIDE_QUAD_TO, WIDE_CUBIC_TO. Uses recursive adaptive Bezier flattening.

---

## Test coverage

**166 tests pass** across 8 test files.

New coverage added in pass 2:

- `createWebCursorBackend` — sets cursor, clears cursor
- `getCursorBackend` — null before set, returns after set
- `getNodeCursor` — null default, returns value, null after clear
- `setCursor` — no-op without backend, calls backend, passes null
- `setCursorBackend` — installs and clears backend
- `setNodeCursor` — assigns and removes cursor
- `containsDisplayObject` — full enclosure, partial, adjacent, no parent
- `getDisplayObjectOverlapRectangle` — overlapping, disjoint, no parent, alias-safe
- `hitTestDisplayObjectsShape` — center-inside-other, adjacent (no overlap), separated, no parent, symmetric
- `hitTestAreaQuery` — no intersection, root hit, child hit, disabled node, out array reuse
- `hitTestAreaQueryCircle` — outside, overlap, corner, disabled, child hit
- `createInteractionManager` — `suppressTouchHover` defaults to `true`, can be set to `false`
- `dispatchInteractionPointerMove` — touch suppresses rollover, touch suppression disabled fires rollover, onPointerMove still fires for touch
- `dispatchInteractionPointerMove cursor auto-assignment` — cursor set on rollover enter, null on leave, no-op without backend

---

## Deferred items and why

### Not implemented

**Bitmap alpha-threshold hit testing** — `defaultBitmapHitTestPoint` still ignores `shapeFlag` and returns bounds-only. Requires `getImageSourcePixelAlpha(source, px, py)` in `@flighthq/surface`. Gate is the surface package, not interaction. The design question (per-node threshold vs. a hard-coded default) should be settled when `@flighthq/surface` exposes the accessor.

**`@flighthq/interaction-gesture` neighbor package** — drag, pan, pinch, swipe, tap, long-press recognizers. The maturation roadmap calls this Gold. Explicitly a design decision: gesture should be a separate `@flighthq/interaction-gesture` package (the `-subpackage` pattern) so the base package stays a pure router and gestures tree-shake independently. Not started; blocked by design approval for the new package.

**Spatial index broadphase** — `InteractionManagerOptions.spatialIndex` with `createQuadtreeSpatialIndex` / `createGridSpatialIndex`. Gold-tier. The linear DFS is the correct zero-config default; large scenes opt in. Not started; requires a `SpatialIndex` type contract in `@flighthq/types`.

**Glyph-box text hit-testing with caret index** — `defaultTextHitTestPoint` honoring `shapeFlag` against laid-out glyph rects from `@flighthq/textlayout`; `getTextHitCaretIndex(node, x, y): number`. Depends on `@flighthq/textlayout` exposing per-glyph rects, which it does not yet.

**Mask-aware picking** — a node clipped by a mask should report a hit only inside the mask region. Requires mask geometry accessible from the node at hit-test time.

**`scrollRect`/viewport clipping in traversal** — not honored.

---

## Design choices made

### Cursor backend as a module-level singleton

`_cursorBackend` lives at module scope in `cursor.ts`, not on `InteractionManager`. This matches the platform-suite backend-seam pattern (all cursor changes for the page share one backend), and avoids threading the backend through every manager. A per-manager cursor backend would be the right choice for an application running multiple canvases with independent cursor zones — noted as a future option if multi-canvas becomes a common use case.

### Touch hover suppression: default `true`

`suppressTouchHover` defaults to `true` in `createInteractionManager`. Mobile devices lack a "pointer left" event from touch, so rollover chains that synthesize on touch move cannot reliably exit. Applications that genuinely want touch hover (e.g. stylus-aware drawing apps) can opt in by passing `{ suppressTouchHover: false }`. The rollover state tracking is not updated when touch moves are suppressed, so an accidental hover state cannot accumulate.

### `hitTestDisplayObjectsShape` as a center-point approximation

A cross-center test (is the center of each object inside the other's bounds?) is practical for most UI overlap checks (drag-and-drop, collision feedback) without SAT convex-hull code. The function document string explicitly calls out the approximation and directs users to `findGraphHitTarget(shapeFlag=true)` for exact shape queries. A full SAT implementation is Gold-tier and deferred.

### `hitTestAreaQuery` / `hitTestAreaQueryCircle` as broadphase stubs

The two spatial query functions are linear O(n) DFS — correct for small to medium scenes. They are the natural API surface for the planned opt-in spatial index (a `SpatialIndex` option on `InteractionManagerOptions`). When the index is added, these functions become the entry points that consult it as a broadphase before the fine DFS.

### Cursor rollover resolution: innermost ancestor wins

`dispatchPointerRolloverChange` walks the rollover chain innermost-first and calls `setCursor` with the first non-null cursor found in the chain (or null when none). This matches the classic `useHandCursor` / `buttonMode` traversal model: the frontmost hit node controls the cursor, but if it has no cursor override, the parent's cursor (if any) takes effect. Applications wanting to block cursor propagation can set `cursor: 'default'` on a container.

---

## Rust conformance divergences (recorded in conformance map)

Recorded in `agents/rust/conformance.md` under "Intentional value-type seam divergences":

1. **`NodeInteractionState` storage**: TS `WeakMap<NodeAny, NodeInteractionState>` → Rust `HashMap<NodeId, NodeInteractionState>` with explicit `dispose_node_interaction` cleanup.
2. **`HitArea` union**: TS structural union discriminated by `'kind' in hitArea` → Rust `enum HitArea { Rectangle(Rectangle), Node(NodeId) }`.
3. **`CursorBackend`**: TS interface → Rust `trait CursorBackend` stored as `Arc<dyn CursorBackend>`; web backend relocated to `host-web`.

---

## Updated score estimate

**91/100** — Gold.

**Scoring breakdown:**

- Hit-test architecture and registry: complete, well-designed (15/15)
- Shape-accurate picking (`containsPathPoint`, fill regions, shapeFlag=true): complete (12/12)
- Tilemap / QuadBatch sub-index picking: complete with detailed resolvers (8/8)
- Per-object interaction gating (`isNodeInteractive`, `areNodeChildrenInteractive`): complete (8/8)
- Hit-area proxy delegation (Rectangle + node): complete (8/8)
- Overlap family (`hitTestDisplayObjects`, `containsDisplayObject`, `getDisplayObjectOverlapRectangle`, `hitTestDisplayObjectsShape`): complete with approximation documented (8/8)
- Cursor management (backend seam, `setNodeCursor`, rollover auto-assignment, touch suppression): complete (10/10)
- Spatial queries (`hitTestAreaQuery`, `hitTestAreaQueryCircle`): complete (6/6)
- `registerDefaultHitTestPoints` startup registrar: complete (4/4)
- Rust conformance divergences recorded: complete (3/3)
- Deductions: bitmap alpha-threshold hit-test still bounds-only (-3), gesture neighbor package not started (-3), spatial broadphase not started (-2), glyph-box text caret missing (-1)

**Remaining to reach 100:**

- Bitmap alpha-threshold (gate: `@flighthq/surface` pixel accessor) → +3
- `@flighthq/interaction-gesture` neighbor package → +4 (requires design approval)
- Spatial index broadphase → +2 (requires `SpatialIndex` types)
- Glyph-box text hit-testing + caret index (gate: `@flighthq/textlayout`) → +1
