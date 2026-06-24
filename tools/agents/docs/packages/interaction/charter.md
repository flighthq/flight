---
package: '@flighthq/interaction'
crate: flighthq-interaction
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

# interaction — Charter

> Durable vision and core values for `@flighthq/interaction`. You author this (via an agent transcribing your direction); it is the rubric `review.md` and `assessment.md` are judged against. No status here — that lives in the review. See ../CONTRACT.md.

## What it is

`@flighthq/interaction` is the SDK's input-to-graph router: it turns a position (or a stream of pointer events) into a hit on a scene-graph node, then dispatches that hit to the right node with bubbling, cancellation, capture, and rollover semantics. It is two cooperating layers that share a node model:

- **Hit testing** — given a world-space point, find which node is under it. Front-to-back DFS (`findGraphHitTarget` / `findGraphHitTargetDetailed`), kind-dispatched per-node tests through an open string registry (`registerHitTestPoint` / `registerHitTestDetailed`), per-node gating (`mouseEnabled` / `mouseChildren`), `hitArea` proxies, shape-accurate picking for shapes, sub-index resolution for tilemap/quad-batch, an overlap family, and linear spatial area queries.
- **Pointer dispatch** — given raw pointer events (via the `@flighthq/input` seam), drive the per-pointer interaction model: bubbling event dispatch with cancellation, click / double-click / `releaseOutside`, multi-pointer capture, rollover-chain diffing, cursor resolution over a backend seam, and lazy subscriber-gated work.

Where it ends: it does **not** own the scene graph (that is `@flighthq/node`), the signal machinery (`@flighthq/signals`), or raw-input normalization (`@flighthq/input`) — it composes them. It is the neighbor of `@flighthq/textinput` (which owns text editing) and of `@flighthq/clip` (which owns clip geometry); interaction consumes those, it does not reimplement them.

## North star (proposed)

_Proposed durable principles, inferred from the design and the SDK-wide forks. Confirm, edit, or reject._

1. **A pure router over a shared node model.** Interaction maps input → node and dispatches; it does not own simulation, geometry, or graph structure. Source data and graph participation live in their owning packages — interaction reads them. (This is the package's side of structural-fork A.)
2. **Registry by default, never a closed `switch(kind)`.** Per-kind hit tests are open string-keyed registries so a new node kind is added without taxing every interaction user, and a user can override a built-in. This is structural-fork B applied to picking, and the package already embodies it — the charter ratifies it as a standing rule.
3. **Zero-config linear by default; acceleration is opt-in.** Picking and area queries are honest full-graph linear DFS with no hidden index. A spatial broadphase, if it lands, is something the caller opts into — the default never silently allocates or maintains an index.
4. **Backend seams for host-coupled behavior.** Anything that touches the host (cursor application) goes through a `*Backend` trait with a web default and `set*Backend`, mirroring the platform suite. The package stays host-agnostic; the web backend is one fill, not a coupling.
5. **Honest capability surface.** A test honors `shapeFlag` for the kinds that can, falls back to bounds where the precise test is gated on a neighbor (bitmap alpha → `surface`, glyph caret → `textlayout`), and documents that fallback rather than pretending. Sentinels (`null`, `-1`) for expected misses; throws only for misuse.

## Boundaries (proposed)

_Proposed in-scope / non-goals. Confirm, edit, or reject._

**In scope**

- Point hit testing across all built-in node kinds, with per-kind registry dispatch and sub-index resolution.
- Pointer-event dispatch: bubbling, cancellation, capture, click/double-click/`releaseOutside`, multi-pointer, rollover-chain diffing.
- Per-node interaction gating (`mouseEnabled` / `mouseChildren`), `hitArea` proxies.
- Cursor management over a backend seam.
- Object overlap detection and linear spatial area queries.

**Non-goals (proposed — see Open directions for the ones still unsettled)**

- Owning the scene graph, signal infrastructure, raw-input normalization, text editing, or clip geometry — all delegated to neighbor packages.
- Gesture recognition (drag/pan/pinch/swipe/tap/long-press) in the base package — proposed as a separate `@flighthq/interaction-gesture` neighbor so the base stays a pure router. **(Open.)**
- A built-in spatial broadphase as the default. An opt-in `SpatialIndex` seam may be in scope, but the maintained index itself may belong to a shared scene-graph acceleration structure. **(Open.)**

## Decisions

None blessed yet.

## Open directions

_Every candidate question this draft could not settle. These are for you to decide, not for an agent to assume._

1. **Where is the gesture boundary?** Status proposes a separate `@flighthq/interaction-gesture` (`-subpackage` pattern) so the base stays a pure router. Bless or reject: does interaction own drag/pinch/swipe at all, and if so as a neighbor package or in-package?
2. **Does broadphase live here?** A `SpatialIndex` seam on `InteractionManagerOptions` is gated on a `@flighthq/types` contract. Is the spatial index interaction's concern, or a shared scene-graph acceleration structure other consumers (culling, queries) also use? This is an instance of structural-fork A (source-data/simulation vs. graph participation).
3. **Clip/mask-aware picking now that `@flighthq/clip` exists.** Should a masked or `scrollRect`-clipped node report hits only inside its clip region, and does interaction reach into clip geometry, or does the node expose it? (Mask-aware / viewport-clipped picking is absent today.)
4. **Cursor backend: module singleton vs. per-manager.** Status records the singleton choice and flags multi-canvas as the case that would want per-manager. The charter should pick the intended multi-canvas posture.
5. **Should `shapeFlag` ship on text/bitmap kinds before they honor it?** It is honored for shapes; bitmap/text still fall back to bounds (gated on `surface` / `textlayout`). Is the uniform signature intentional (consistency), or should unsupported kinds omit `shapeFlag` until the gated packages land?
6. **Graph-feature-alias typing for the overlap family.** `hitTestDisplayObjects`, `containsDisplayObject`, `getDisplayObjectOverlapRectangle`, and `hitTestDisplayObjectsShape` are typed against `DisplayObject` but operate on node-level bounds/links; the codebase-map rule says reusable graph APIs should depend on graph-feature aliases (`BoundsNode` / `Spatial2DNode`), which `spatialQuery.ts` already does. Should the overlap family be widened so a sprite-graph node can use it? (Within-package type-precision; likely Recommended, but it is a small API-shape call.)
7. **`hitTestDisplayObjectsShape` precision.** It is a documented cross-center + AABB approximation; true transformed/rotated convex shape-vs-shape (SAT) is absent. Is the approximation the intended ceiling, or is exact shape overlap in scope?
8. **`hitArea` proxy coordinate semantics.** `findGraphHitTargetDetailed` over a `hitArea` proxy computes the sub-index in the source node's local space using the source node's kind. The local-coordinate semantics across a proxy are unspecified — the charter should state them.
