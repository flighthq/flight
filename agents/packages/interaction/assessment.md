---
package: '@flighthq/interaction'
updated: 2026-07-13
basedOn: ./review.md
---

# interaction — Assessment

Sorted from the 2026-07-13 rereview (solid, 68/100). The dispatch layer is deep and healthy; the hit-testing layer is bounds-only with `shapeFlag` dead wiring. The dominant fact is that most of the gap list is **already Approved** (2026-07-02, Tiers 1–3) and Tier 1 alone was delivered before the builder's mature layer was lost — Tiers 2–3 remain the standing rebuild scope, restated below so a worker brief can carry them. New sweep-safe items found by the rereview are listed alongside.

## Recommended

Standing Approved rebuild (Tiers 2–3 of the 2026-07-02 approval — the design decisions are already settled by the ledger and charter Decisions #4/#5):

- **Shape-accurate picking.** `defaultShapeHitTestHandler` honors `shapeFlag=true` via `getShapeFillRegions` (`@flighthq/shape`) + `containsPathPoint` (`@flighthq/path`); bounds fallback for gradient/bitmap fills. Promotes `@flighthq/shape` from devDependency and adds `@flighthq/path` — blessed by the Tier-3 approval.
- **Per-node interaction gating.** `setNodeInteractive`/`isNodeInteractive` (self-hit opt-out) and `setNodeChildrenInteractive`/`areNodeChildrenInteractive` (subtree opt-out), consulted by `findGraphHitTarget`/`hitTestGraphPoint`. State in a package-local `WeakMap`; distinct from `enabled`.
- **`hitArea` proxy.** `setNodeHitArea`/`getNodeHitArea` over the existing (currently orphaned) `HitArea` type in `@flighthq/types`; `findGraphHitTarget` delegates to the proxy. (Sub-index semantics across a proxy stay Open direction #2 — the boolean path does not need them.)
- **Detailed hit + sub-index.** `findGraphHitTargetDetailed(source, x, y, out, shapeFlag?)` filling the existing `HitTestResult` type; `registerHitTestDetailed(kind, fn)` registry; real Tilemap per-populated-tile and QuadBatch per-quad tests replacing the bounds fallbacks, with `resolveTilemapHitSubIndex`/`resolveQuadBatchHitSubIndex`.
- **`suppressTouchHover`** (default `true`) on `InteractionManager`/`InteractionManagerOptions` — touch pointer moves do not synthesize rollover chains.
- **Clip-aware picking** (Decision #4). Gate hits through `clipRegionContainsPoint` when a node carries a clip region; adds `@flighthq/clip` — blessed.

New sweep-safe items from the rereview:

- **Document the bounds fallbacks** on every `_shapeFlag` handler (Decision #5 / North star #5 compliance: the fallback must be stated, not silent) and on `hitTestDisplayObjectsShape` (cross-center approximation + pointer to the exact path) and `getDisplayObjectOverlapRectangle` (empty-rect-on-disjoint contract).
- **Fix doc slips**: `hitTestGraphPoint` comment says `registerHitTest` → `registerHitTest`; `CursorBackend` doc in `@flighthq/types` claims a disposer against a `void` signature (types file, one line — pair with any Tier-2 types touch).
- **Manifest hygiene**: move `@flighthq/displayobject` to `devDependencies` (only tests import it); extend the `package.json` description to mention pointer dispatch.
- **Register `defaultTextInputHitTestHandler` or unexport it** — currently exported but wired to no kind; resolve within the registrar once the coverage-policy question (Open direction below) is answered, or drop the export as dead surface.

## Backlog

Parked — each with why:

- **Cursor management rebuild.** _Parked — design unsettled._ Charter Open direction #1 (module singleton vs per-manager, multi-canvas). Do not rebuild the singleton until directed; the orphaned `Cursor`/`CursorBackend` types wait on the same call.
- **Default registrar coverage for `NativeText`/`BitmapText`/`ParticleEmitter`.** _Parked — design decision._ Whether interaction's registrar owns every renderable kind or composition packages register their own is a boundary question (new Open direction; bundle-invariant implications).
- **Bitmap alpha-threshold picking.** _Parked — gated on `@flighthq/surface`_ exposing a pixel-alpha accessor.
- **Glyph-box text picking + caret index.** _Parked — gated on `@flighthq/textlayout`_ per-glyph rects.
- **True SAT overlap for `hitTestDisplayObjectsShape`.** _Parked — precision ceiling unsettled_ (Open direction #3).
- **`getDisplayObjectOverlapRectangle` disjoint contract (empty rect vs boolean).** _Parked — small API design fork_ (new Open direction; the lost implementation returned `boolean`).
- **Spatial broadphase (`SpatialIndex` opt-in).** _Parked — profiling-gated_ (Decision #6 blessed the seam location, not the build).
- **`@flighthq/gestures` neighbor package.** _Parked — new package_ (Decision #1).
- **Rust `flighthq-interaction` crate.** _Parked — cross-worktree; sequenced after the TS surface stabilizes_ (Open direction #4).

## Approved

- [2026-07-02 · picked] Tiers 1–3 integration: registerDefaultHitTests, traversal-order doc, spatial queries, overlap family, HitTestResult + detailed hit, gating, hitArea, suppressTouchHover, shape-accurate picking, tilemap/quad-batch sub-index, clip-aware picking
