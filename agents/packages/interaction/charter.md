---
package: '@flighthq/interaction'
crate: flighthq-interaction
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# interaction — Charter

## What it is

`@flighthq/interaction` is the SDK's **input-to-graph router**: it turns a position (or a stream of pointer events) into a hit on a scene-graph node, then dispatches that hit with bubbling, cancellation, capture, and rollover semantics. Two cooperating layers share a node model:

- **Hit testing** — given a world-space point, find which node is under it. Front-to-back DFS, kind-dispatched per-node tests through an open string registry (`registerHitTest`), per-node gating (`mouseEnabled`/`mouseChildren`), `hitArea` proxies, shape-accurate picking (when `shapeFlag=true`), sub-index resolution for tilemap/quad-batch, overlap detection, and linear spatial area queries.
- **Pointer dispatch** — given raw pointer events (via the `@flighthq/input` seam), drive the per-pointer interaction model: bubbling event dispatch with cancellation, click/double-click/`releaseOutside`, multi-pointer capture, rollover-chain diffing, cursor resolution, and lazy subscriber-gated work.

Where it ends: it does **not** own the scene graph (`@flighthq/node`), signal machinery (`@flighthq/signals`), raw-input normalization (`@flighthq/input`), text editing (`@flighthq/textinput`), clip geometry (`@flighthq/clip`), or gesture recognition (`@flighthq/gestures`). It composes or consumes those neighbors.

## North star

1. **A pure router over a shared node model.** Interaction maps input → node and dispatches; it does not own simulation, geometry, or graph structure. Source data and graph participation live in their owning packages — interaction reads them.
2. **Registry by default, never a closed `switch(kind)`.** Per-kind hit tests are open string-keyed registries so a new node kind is added without taxing every interaction user, and a user can override a built-in.
3. **Zero-config linear by default; acceleration is opt-in.** Picking and area queries are honest full-graph linear DFS with no hidden index. A spatial broadphase, if it lands, is something the caller opts into — the default never silently allocates or maintains an index.
4. **`DisplayObject` is the user-facing type.** Graph-feature aliases like `Spatial2DNode` are implementation details. Public API surfaces that users interact with are typed on `DisplayObject`.
5. **Honest capability surface.** A hit test honors `shapeFlag` for the kinds that can (shapes via path-fill containment), falls back to bounds where the precise test is gated on a neighbor (bitmap alpha → `surface`, glyph caret → `textlayout`), and documents that fallback rather than pretending. Sentinels (`null`, `-1`) for expected misses; throws only for misuse.

## Boundaries

**In scope:**

- Point hit testing across all built-in node kinds, with per-kind registry dispatch and sub-index resolution.
- Pointer-event dispatch: bubbling, cancellation, capture, click/double-click/`releaseOutside`, multi-pointer, rollover-chain diffing.
- Per-node interaction gating (`mouseEnabled`/`mouseChildren`), `hitArea` proxies.
- Clip/mask-aware picking — a clipped node reports hits only inside its clip region, consuming `@flighthq/clip`.
- Object overlap detection (AABB-based, typed on `DisplayObject`).
- Linear spatial area queries (rect, circle).
- Cursor management (design of the multi-canvas-capable architecture is unsettled — see Open directions).
- A `registerDefaultHitTests()` one-call registrar for the built-in bank.
- Touch hover suppression (`suppressTouchHover`).

**Non-goals:**

- Owning the scene graph, signal infrastructure, raw-input normalization, text editing, or clip geometry — all delegated to neighbor packages.
- Gesture recognition (drag/pan/pinch/swipe/tap/long-press) — separate `@flighthq/gestures` package.
- A built-in spatial broadphase as the default pick path. An opt-in spatial index may land as interaction's concern — the default stays linear DFS.

## Decisions

- **[2026-07-02] Gestures are a separate `@flighthq/gestures` package.** Drag, pan, pinch, swipe, tap, long-press belong in a focused neighbor so the base stays a pure router and gestures tree-shake independently.

  **Why:** Gestures are a layer _on top of_ routing, not part of it. A user who only needs click/rollover shouldn't pay for recognizer state machines. The same decomposition principle as `-formats` neighbors.

- **[2026-07-02] `DisplayObject` is the correct typing for the overlap family, not graph-feature aliases.** `hitTestDisplayObjects`, `containsDisplayObject`, `getDisplayObjectOverlapRectangle`, and `hitTestDisplayObjectsShape` are typed on `DisplayObject` — the user-facing type. `Spatial2DNode` is an implementation detail; widening to it would leak internal abstractions into the public API.

  **Why:** Users think in `DisplayObject`, not `Spatial2DNode`. The overlap family is a display-object feature surface.

- **[2026-07-02] `*Handler` suffix is intentional on default hit-test functions.** `defaultBitmapHitTestHandler`, `defaultShapeHitTestHandler`, etc. keep the `Handler` suffix to signal that these are callbacks passed to `registerHitTest`, not functions users call directly.

  **Why:** Without the suffix, `defaultBitmapHitTestPoint` reads like a function invocation. The `Handler` suffix communicates that the value is a registrable callback — a thing you pass, not a thing you call.

- **[2026-07-02] Clip-aware picking is in scope.** A masked or clipped node should report hits only inside its clip region. Interaction consumes `clipRegionContainsPoint` from `@flighthq/clip` to gate hit tests. The clip package owns the geometry; interaction owns the query integration.

  **Why:** A clipped node that reports hits outside its visible region is a user-visible bug, not a missing feature. Now that `@flighthq/clip` has `clipRegionContainsPoint` with exact winding support, the dependency is clean.

- **[2026-07-02] `shapeFlag` stays on the public surface even for kinds that don't yet honor it.** Bitmap and text hit tests currently fall back to bounds when `shapeFlag=true`. The parameter stays for signature consistency; the fallback is documented, not hidden. Implementations land as gated packages mature (`@flighthq/surface` for bitmap alpha, `@flighthq/textlayout` for glyph rects).

  **Why:** Removing and re-adding the parameter is churn. Keeping it with an honest bounds fallback is the same pattern as "conservative by default, exact when available" — consistent with clip's two-API-path decision.

- **[2026-07-02] Broadphase is interaction's opt-in, not a shared structure — for now.** The spatial index lands as `InteractionManagerOptions.spatialIndex`. If culling or physics later need it, the index can be extracted into a shared primitive. Start specific, generalize on demand.

  **Why:** Interaction is the primary consumer. Building a shared acceleration structure for one consumer is premature. The SDK's decomposition philosophy says: extract when the second consumer appears.

## Open directions

1. **Cursor management architecture.** The builder chose a module-level singleton matching the platform-suite `*Backend` pattern. Multi-canvas needs per-manager cursor zones. The `*Backend` pattern hasn't been reviewed for this use case. Design the multi-canvas-capable cursor architecture before building.

2. **`hitArea` proxy coordinate semantics.** `findGraphHitTargetDetailed` over a `hitArea` proxy computes the sub-index in the source node's local space using the source node's kind. The local-coordinate semantics across a proxy are unspecified — the charter should state them once the detailed-hit API is implemented.

3. **`hitTestDisplayObjectsShape` precision ceiling.** The builder implemented a cross-center + AABB approximation. True transformed/rotated convex shape-vs-shape (SAT) is absent. Decide whether exact SAT overlap is in scope or the approximation is the intended ceiling.

4. **Rust `flighthq-interaction` crate.** Does not exist. The registry becomes `HashMap<KindId, _>`, free functions over `(&mut NodeArena<T>, NodeId)`. Sequenced after TS surface stabilizes.
