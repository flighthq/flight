---
package: '@flighthq/shape'
updated: 2026-07-02
basedOn: ./review.md
---

# shape — Assessment

Sorted from the depth review (solid, 78/100), the builder's as-claimed expansion (partially landed — command vocabulary and hit-test builtins present, but cubic extrema, per-span stroke bounds, and shapeGraphicsData are absent in the live tree), and the direction session (2026-07-02). Five decisions blessed. The command vocabulary is broad (43 exports, 92 tests). The key correctness gaps are: cubic bounds using control-point hull, global stroke expansion, drawTriangles unhandled in bounds/fill, and drawPath winding hardcoded.

## Recommended

Sweep-safe correctness fixes and the missing typed round-trip — all within `@flighthq/shape`, no open design decision.

- **Exact cubic bezier extrema in `computeShapeLocalBoundsRectangle`.** Replace the control-point hull for `cubicCurveTo` (and `drawPath` `CUBIC_CURVE_TO`) with derivative-root solving (the quadratic-in-t roots of the cubic derivative per axis), matching the existing quadratic-extrema treatment. Pure correctness fix.
- **Per-span stroke-aware bounds.** Track active `strokeWidth` per fill/stroke span and apply `strokeHalf` at each point inside `expand()`, so two segments of different thickness each get their own expansion. Currently uses global last-style expansion at the end.
- **Handle `drawTriangles` in bounds and fill.** Bounds: vertex sweep in `computeShapeLocalBoundsRectangle`. Fill: `hasNonSolidShapeFill` should treat `drawTriangles` with `uvtData` as non-solid. `getShapeFillRegions` should ignore drawTriangles entries (they are render-only commands in the fill path).
- **Honor `drawPath` winding in `getShapeFillRegions`.** Stop hardcoding `winding: 'nonZero'`; carry the per-`drawPath` `PathWinding` into the emitted `ShapeFillRegion.path.winding`. Default pen-path fills to `'nonZero'` explicitly.
- **Remove the meaningless `getShapeBounds` aliasing comment.** `out: Rectangle` and `source: Readonly<Shape>` cannot alias — the comment is boilerplate from a true alias-safe function. Remove it.
- **Typed readback/round-trip: `shapeGraphicsData.ts`.** New file with three functions:
  - `getShapeGraphicsData(source: Readonly<Shape>): readonly ShapeGraphicsRecord[]` — typed decoder over the flat buffer.
  - `forEachShapeCommand(source: Readonly<Shape>, visitor: (record: Readonly<ShapeGraphicsRecord>) => void): void` — typed walk. Decide whether to allocate per call or reuse a scratch record (document the contract either way).
  - `appendShapeGraphicsData(shape: Shape, records: readonly Readonly<ShapeGraphicsRecord>[]): void` — typed write/replay.
  - Requires `ShapeGraphicsRecord` discriminated union in `@flighthq/types` (keyed by `ShapeCommandKey` over the existing `ShapeCommandRegistry`).
- **Add `@flighthq/path` as a dependency.** Per Decision #4, shape should depend on path. Centralize the KAPPA constant and any shared curve seam rather than re-deriving locally.

## Backlog

Parked — each with the reason it is not sweep-safe.

- **Scale-9 distortion behavior.** _Parked — design unsettled._ Whether shape owns command rewriting under `scale9Grid` is Open direction #1.
- **`@flighthq/shape-formats` neighbor package.** _Parked — new package._ Blessed (Decision #3), but the JSON schema, SVG export surface, and the `-formats` scope need design. Cross-package.
- **Stroke hit-testing.** _Parked — cross-package._ Composes shape (style data) + path (stroke outline expansion) + interaction (hit dispatch). Per Decision #2, stroke-to-geometry is path's concern.
- **Robustness policy.** _Parked — design unsettled._ Open direction #3.
- **Flatten-consistency refactor.** _Parked — cross-package._ Centralizing curve constants and flattening tolerance across bounds/fill/hit-test passes. The path dependency (Decision #4) unblocks this but the refactor scope is larger than a sweep.
- **`ShapeGraphicsRecord` / hit-test types split from `ShapeCommand.ts`.** _Parked — types-layout owner._ One-concept-per-file candidate revision in `@flighthq/types`.
- **Graphics parity holes.** _Parked — cross-package._ `beginShaderFill`/`lineShaderStyle` (needs materials seam), `drawQuads`/`drawTiles` (overlap with sprite).
- **Rust `flighthq-shape` crate.** _Parked — cross-worktree._ Open direction #4.

## Approved

- [2026-07-02 · picked] Correctness sweep: exact cubic bounds, per-span stroke bounds, drawTriangles in bounds/fill, honor drawPath winding, remove getShapeBounds aliasing comment, typed readback/round-trip (shapeGraphicsData.ts + ShapeGraphicsRecord type), add path dependency
