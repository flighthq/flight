---
package: '@flighthq/interaction'
status: solid
score: 68
updated: 2026-07-13
ingested:
  - charter.md
  - status.md
  - review.md (prior, 2026-06-24)
  - assessment.md (prior, 2026-07-02)
  - source (packages/interaction/src, all 8 source + 7 test files)
  - packages/types (InteractionManager, HitTestResult, NodeInteraction, Cursor, HitTestFunction)
---

# interaction — Review

## Verdict

**solid — 68/100.** The pointer-dispatch layer is deep and well-shaped (bubbling with cancellation, rollover-chain diffing, click/double-click/`releaseOutside`, multi-pointer capture, lazy subscriber-gated dispatch, a documented coordinate-space seam); the hit-testing layer has the right registry architecture but shallow handlers — every default handler is bounds-only or `false`, and `shapeFlag` is dead wiring across all 14 registered kinds. The prior review's 84 was scored against a builder expansion (cursor management, gating, `hitArea`, detailed/sub-index hit, shape-accurate picking, touch suppression) that is **not in this tree** — the 2026-06-25 status entry records it as lost, and only the Tier-1 slice was rebuilt (`registerDefaultHitTests`, spatial queries, overlap family, traversal-order docs — commit `74de080d`). The charter (blessed 2026-07-02) describes the lost mature shape as the package's identity, so most of what it charters is currently a rebuild backlog, much of it already in the Approved ledger. 98 tests pass across 7 colocated files.

## Present capabilities

**Hit testing (`hitTests.ts`).** `findGraphHitTarget` — front-to-back reverse-order DFS returning the deepest topmost hit, with a doc comment on why it reverses child order; `hitTestGraphPoint` — natural-order any-hit boolean, documented as to why the orders differ; `hitTestGraphLocalBounds` — world→local inverse transform + local-bounds containment on a module scratch point; `hitTestDisplayObjects` — world-AABB overlap with attached-parent guards, typed on `DisplayObject` per Decision #2. `registerHitTest` is an open string-keyed `Map<Kind, HitTestFunction>` registry — structural-fork B exactly.

**Default handlers (`displayHitTests.ts`, `spriteHitTests.ts`).** Eleven display handlers (`default*HitTestHandler`, the `Handler` suffix per Decision #3): bounds-based for Bitmap/RenderView/RichText/Shape/Text/TextInput/Video, `false` for the containers (DisplayObject/MovieClip/Stage) and HtmlView (browser owns its pointer events, commented). Sprite family: `defaultSpriteHitTestHandler` bounds-based; QuadBatch and Tilemap **fall back to the sprite bounds test** — the per-quad/per-tile tests are pending (relocated TODOs in status, 2026-07-03).

**Registrar (`registerDefaultHitTests.ts`).** One-call opt-in wiring 14 kinds (including `Scale9ShapeKind` via the shape handler). Never at module top level; tree-shaken when unused.

**Overlap family (`displayObjectOverlap.ts`).** `containsDisplayObject` (world-bounds enclosure), `getDisplayObjectOverlapRectangle` (out-param intersection; disjoint yields the empty rectangle via `computeRectangleIntersection`), `hitTestDisplayObjectsShape` (AABB reject + cross-center heuristic). All typed on `DisplayObject` per Decision #2.

**Spatial queries (`spatialQuery.ts`).** `hitTestAreaQuery` (rect) and `hitTestAreaQueryCircle` (nearest-point-on-AABB) — honest linear O(n) DFS collecting enabled nodes into an optional out array.

**Manager (`interactionManager.ts`, 703 lines — the package's center of mass).** 15 typed signals; bubbling `emitInteractionSignal` with per-node cancellation and `currentTarget`/local-coordinate fill; rollover-chain diffing (`onPointerRollOver`/`RollOut` vs `onPointerOver`/`Out`); click/double-click with `doubleClickDelay` and `onReleaseOutside`; per-pointer state maps and `captureInteractionPointer`/`releaseInteractionPointer`; lazy dispatch gating via tracked subscriber counts with a `trackedSubscribersOnly` fast path and a graph-scan fallback; `connectInputToInteraction` — the `@flighthq/input` seam with `coordScale` and a thorough JSDoc coordinate-space contract (CSS pixels → device pixels, scale-not-translate; added 2026-07-09, `dfacf63e`). Reused module-scratch payload objects keep the hot path allocation-free.

**Tests.** 98 `it()` across 7 files, mirroring source; the manager file alone carries 40 covering bubbling, cancellation, capture, rollover diffing, double-click timing, releaseOutside, and subscriber gating.

## Gaps

Versus a mature scene-graph hit-testing/pointer-dispatch library (raw-input normalization is `@flighthq/input`'s cell; collider-vs-collider is `@flighthq/collision`'s):

- **`shapeFlag` is dead wiring everywhere — including Shape.** The charter's North star #5 states shapes honor it via path-fill containment; `defaultShapeHitTestHandler` ignores it (`_shapeFlag`) with no documented fallback. The winding-test implementation (via `getShapeFillRegions` + `containsPathPoint`) existed in the lost tree and is Approved for rebuild.
- **No per-node interaction gating** (`mouseEnabled`/`mouseChildren` equivalents). Only `node.enabled` gates traversal; a node cannot opt out of self-hits while keeping children interactive. Approved.
- **No `hitArea` proxy.** The `HitArea` type sits in `@flighthq/types` with a doc comment referencing `setNodeHitArea` — which does not exist. Approved.
- **No detailed hit / sub-index resolution.** `HitTestResult` is likewise orphaned in types; no `findGraphHitTargetDetailed`, no `registerHitTestDetailed`, no tile/quad sub-index resolvers. Tilemap/QuadBatch handlers are bounds fallbacks. Approved.
- **No cursor management.** `Cursor`/`CursorBackend` orphaned in types; no `setNodeCursor`, no backend seam, no rollover cursor resolution. Charter Open direction #1 (design unsettled — module singleton vs per-manager).
- **No touch-vs-mouse semantics.** `suppressTouchHover` is chartered in-scope and Approved but absent from both the manager and `InteractionManagerOptions`.
- **No clip/mask-aware picking** (Decision #4, in scope, Approved) — a clipped node reports hits across its full bounds.
- **Default registrar kind coverage is incomplete**: `NativeTextKind`, `BitmapTextKind`, `ParticleEmitterKind` exist in types but have no default handler; `defaultTextInputHitTestHandler` is exported but never registered.
- **Bitmap alpha picking** (gated on a `@flighthq/surface` pixel-alpha accessor) and **glyph-box text picking / caret index** (gated on `@flighthq/textlayout`) remain neighbor-gated.
- **`hitTestDisplayObjectsShape` is an undocumented approximation** — the cross-center heuristic carries no doc comment in this tree explaining its limits or pointing to the exact path; `getDisplayObjectOverlapRectangle`'s empty-rect-on-disjoint contract is also undocumented.
- **No spatial broadphase** (opt-in per Decision #6, future) and **no gestures** (separate `@flighthq/gestures` per Decision #1) — both deferred by blessed design, listed for completeness.

## Charter contradictions

One live contradiction: **North star #5 / Decision #5 require the bounds fallback to be *documented*, and it is not** — every `_shapeFlag` handler is silent, with no doc comment, no guard, and no `explain*` seam (the diagnostics convention would call this a missing guard). Otherwise no code contradicts a blessed ruling — Decisions #2 (`DisplayObject` typing) and #3 (`*Handler` suffix) are complied with. The larger mismatch runs the other direction: the charter's "What it is" narrates shape-accurate picking, gating, `hitArea` proxies, sub-index resolution, cursor resolution, and `suppressTouchHover` as the package's present anatomy, but they are chartered-not-built in this tree. That is drift to be resolved by rebuilding (most of it is already Approved), not a charter rewrite.

## Contract & docs fit

**Lives up to the contract:** single root barrel (`index.ts` thin re-exports); `sideEffects: false`; registration opt-in, never top-level; open registries not `switch(kind)`; sentinels not throws (`null` miss, empty rect); full unabbreviated names with correct `is*`/`register*`/`enable*`/`dispatch*` verbs; out-params on the overlap rect and area queries; allocation-free hot paths via module scratch state; types-first (`InteractionManager`, signals, event data all in `@flighthq/types`). The prior review's stale `@flighthq/scene` dependency is confirmed removed.

**Candidate revisions:**

- **`@flighthq/displayobject` is a runtime dependency but only tests import it** — should move to `devDependencies` (source imports only geometry/node/signals/types).
- **Orphaned header types**: `HitTestResult`, `HitArea` (`NodeInteraction.ts`), and `Cursor`/`CursorBackend` are exported from `@flighthq/types` with doc comments naming functions that don't exist anywhere (`findGraphHitTargetDetailed`, `setNodeHitArea`, `setCursorBackend`). Acceptable as design-surface-ahead-of-implementation while the rebuild is Approved; the `CursorBackend` doc additionally still claims "returns a disposer" against a `void` signature — the exact mismatch the prior review flagged.
- **`hitTests.ts` doc slip**: `hitTestGraphPoint`'s comment says handlers are "registered via `registerHitTest`" — the function is `registerHitTest`.
- **`package.json` description** ("Hit testing: point-in-node tests and object overlap detection") omits the pointer-dispatch layer, which is most of the package.
- **Package Map line** ("hit testing, pointer dispatch, overlap detection") now roughly matches this tree — the prior review's complaint that it understated the package described the lost state; today it only misses the spatial queries and registrar.

## Candidate open directions

The charter already carries the big four (cursor architecture, `hitArea` proxy coordinate semantics, SAT precision ceiling, Rust crate). New questions this review had to assume:

1. **Default registrar coverage policy.** Should `registerDefaultHitTests` cover every renderable kind (`NativeText`, `BitmapText`, `ParticleEmitter`), or do composition packages (`bitmaptext`, `particleemitter`) own their kinds' handlers to keep interaction free of their weight? The unregistered-but-exported `defaultTextInputHitTestHandler` needs the same ruling.
2. **Orphaned types disposition.** Keep `HitTestResult`/`HitArea`/`Cursor` in the header as the design surface for the Approved rebuild, or prune until reimplementation lands? (Types-first says keep; the disposer doc-claim should be fixed either way.)
3. **`getDisplayObjectOverlapRectangle` disjoint contract.** Empty-rect sentinel vs a boolean return (the lost implementation returned `boolean`) — pick one and document it.
