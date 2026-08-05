---
package: '@flighthq/shape'
updated: 2026-08-04
basedOn: ./review.md
---

# shape — Assessment

Sorted from the 2026-07-13 rereview (solid, 82/100). Most of the 2026-07-02 Approved correctness sweep has landed and is verified in source; what remains is the unlanded tail of that approval (typed round-trip, the path-dependency question), test debt for the landed fixes, and a few small doc/correctness defects.

## Recommended

Sweep-safe: within `@flighthq/shape` (plus its owned header types in `@flighthq/types`, per types-first), no breaking change, no open design decision.

- **~~Land the approved typed round-trip (`shapeGraphicsData.ts`)~~** — retired 2026-08-04. Reconciled against source: none of `shapeGraphicsData.ts`, `getShapeGraphicsData`, `forEachShapeCommand`, `appendShapeGraphicsData`, or `ShapeGraphicsRecord` exists, and the tree reached its typed-readback goal by another route. Struck rather than deleted because the `[2026-07-02 · picked]` Approved line still blesses it, and that ledger is append-only: this note is what reconciles the standing approval with a shape the code will not take. Re-propose against current names if the capability is still wanted.
- **Add `drawTriangles` to `ShapeCommandRegistry`.** The vocabulary emits the key and bounds/fill handle it, but the header registry lacks the entry, so `ShapeCommandKey` excludes it and a typed hit-test handler for it cannot be declared. Tuple: `[vertices: number[], indices: number[] | null, uvtData: number[] | null, culling: TriangleCulling]`.
- **Backfill tests for the landed 2026-07-02 fixes.** Bounds: cubic-extrema (curve bulging past its hull), per-span stroke expansion (two thicknesses), `drawTriangles` vertex sweep, `drawPath` verb decoding. Fill: `drawPath` winding carried into `ShapeFillRegion.path.winding`, `drawTriangles`-with-uvtData → non-solid. The fixes are currently verified only by source reading.
- **~~Manifest hygiene: `@flighthq/geometry` dependency.~~** — retired 2026-08-05. OBSOLETE: geometry is no longer test-only. `morphShapePaint.ts` imports `cloneMatrix` and `createMatrix` from `@flighthq/geometry/contract` for production paint sampling, so the runtime dependency now reflects live shipped source and must not be moved to a test-only slot.

## Backlog

Parked — each with the reason it is not sweep-safe.

- **Decision #4 follow-through (path dependency / shared curve constants).** _Parked — needs a superseding ruling._ `PathCommand` was homed in `@flighthq/types` instead of adding the path dependency, but KAPPA is still duplicated and shape's and path's copies differ by a digit (path's `0.5522847498308936` looks like the typo). Fixing the divergence touches `@flighthq/path`; deciding the constant's home is a charter call. Surface to Open directions.
- **Pen-state home for `appendShapeArcTo`.** _Parked — API-shape decision._ The per-call O(n) buffer rescan wants a runtime pen slot or an explicit pen parameter; either changes the authoring contract.
- **Whole-shape / pen-path fill hit-testing.** _Parked — design + cross-package._ A `hitTestShapePoint` composing `getShapeFillRegions` with path's winding containment spans the shape/path seam; per-command polygon handlers alone need a containment kernel shape shouldn't own.
- **Stroke hit-testing.** _Parked — cross-package per Decision #2._ Composes shape style data + path stroke-outline expansion.
- **Miter-aware stroke bounds.** _Parked — needs the same stroke-geometry seam._ Per-point `strokeHalf` under-covers miter spikes; a correct term needs joint geometry (path's domain).
- **Scale-9 distortion behavior.** _Parked — Open direction #1._
- **Robustness policy (degenerate radii, odd-length polygon arrays, NaN).** _Parked — Open direction #3; needs blessing before guards/`explain*` are authored._
- **`ShapeCommand.ts` one-concept-per-file split.** _Parked — types-layout owner._
- **Graphics parity holes (`beginShaderFill`/`lineShaderStyle`, quads/tiles).** _Parked — charter non-goals/deferred, cross-package._
- **Rust `flighthq-shape` crate.** _Parked — cross-worktree; Open direction #4._

## Approved

- [2026-07-02 · picked] Correctness sweep: exact cubic bounds, per-span stroke bounds, drawTriangles in bounds/fill, honor drawPath winding, remove getShapeBounds aliasing comment, typed readback/round-trip (shapeGraphicsData.ts + ShapeGraphicsRecord type), add path dependency
- [2026-08-02 · picked] Retained MorphShape: distinct kind, prepared PathMorph ownership, stable live-path insertion into Shape styles, explicit progress sampling/invalidation, and default renderer aliases across all 2D backends.
