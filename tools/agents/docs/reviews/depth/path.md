# Depth Review: @flighthq/path

**Domain:** Vector path geometry — construction of 2D outline paths (move/line/quadratic/cubic verbs) and conversion of those outlines into renderer-consumable forms: flattened polyline contours and triangulated fill meshes.

**Verdict:** partial — completeness **38/100**

The package is correct, well-commented, and does the two things its own description promises (curve flattening and fill tessellation) competently. But measured against what a _path_ library is canonically expected to offer, it covers only the build-and-rasterize-input slice and omits nearly the entire analytic/geometric and editing surface that defines the domain.

## Present capabilities

Exported surface (7 functions):

- **Construction:** `createPath(winding)`, `appendPathMoveTo`, `appendPathLineTo`, `appendPathCurveTo` (quadratic), `appendPathCubicCurveTo`. A clean, append-into-`Path` builder over a verb stream (`commands`) + flat coordinate stream (`data`), with a fill rule (`nonZero`/`evenOdd`) carried on the path. Plain-data, C/GPU-friendly, matching SDK style.
- **Flattening:** `flattenPath(path, tolerance)` → array of flat `[x,y,...]` contours. Adaptive de Casteljau subdivision for both quadratics and cubics, squared chord-distance flatness test (no per-test sqrt), depth cap (16), implicit-contour-at-origin fallback, and correct handling of `WIDE_MOVE_TO`/`WIDE_LINE_TO`/`NO_OP` verbs. This is a solid, production-grade flattener.
- **Tessellation:** `tessellatePath(path, tolerance)` → `PathMesh` (vertex buffer + triangle indices). Ear-clipping per contour with CCW normalization via signed area, coincident-point and explicit-close dedup, a reflex/collinear ear rejection, point-in-triangle containment test, and a spin guard for degenerate input. Honest about its limits: holes, overlap, and self-intersection are not subtracted (documented as the flatten + stencil-cover route's job).

Both algorithm files are genuinely careful — alias-free, hot-loop-conscious, and the comments explain coordinate space, stride semantics, and the degenerate-input reasoning. The depth that exists is real depth, not stub code.

## Gaps vs an authoritative path library

A canonical 2D path/vector-geometry library (compare Skia `SkPath`/`SkPathMeasure`, Cairo, Lyon, paper.js, `flatten-js`, kurbo) is expected to cover construction, analysis, transformation, and boolean ops. Against that bar, most categories are entirely absent:

- **Primitive builders (missing):** no `appendPathArc` / `appendPathArcTo`, `appendPathRectangle`, `appendPathRoundRectangle`, `appendPathEllipse`/`appendPathCircle`, `appendPathPolygon`, or `closePath`/`appendPathClose`. There is no close verb at all — closing is inferred by the tessellator from a coincident endpoint, never authored. (Note: `appendShapeRoundRectanglePath` exists in `@flighthq/shape`, i.e. primitives live one layer up, leaving the path layer itself without them.)
- **Arc/elliptical-arc support (missing):** the `PathCommand` set has no arc verb; SVG-style arcs must be pre-converted to cubics by the caller. A path library is normally expected to own arc→bezier conversion.
- **Measurement / analysis (missing):** no path length, no point-at-distance / tangent-at-distance (`PathMeasure`), no `getPathBounds`, no fill/stroke area, no `isPointInPath` (hit testing respecting the winding rule), no winding/orientation query, no curve evaluation (point at t) or derivative.
- **Transformation (missing):** no `transformPath(path, matrix)`, `copyPath`/`clonePath`, `reversePath`, `translatePath`, or normalization. The path is mutate-by-append only; there is no way to produce a transformed copy.
- **Stroking (missing):** no stroke-to-outline (offsetting a centerline into a fillable contour with joins/caps/miter/dashing). This is a defining feature of mature path libraries and is the natural companion to the fill tessellator already here.
- **Boolean / clipping ops (missing):** no union/intersection/difference/xor on paths. The tessellator explicitly punts holes and self-intersection; there is no robust polygon-with-holes triangulation (no equivalent of earcut's hole-bridging) and no general overlay.
- **Simplification / conversion (missing):** no path simplification/decimation, no curve fitting (polyline → beziers), no SVG path-string parse/serialize (`parsePathData` / `serializePathData`), no flattening to a single closed/decimated contour.
- **Segment iteration (missing):** no public iterator over (verb, points) segments; consumers must re-walk the raw `commands`/`data` stride themselves (as `flattenPath` does internally).

So the present set answers "build an outline and hand vertices to a renderer" but not "ask geometric questions about, edit, combine, or stroke a path" — which is the bulk of the domain.

## Naming / API-shape notes

- Naming is consistent and self-identifying per project rules: every function carries the full `Path` type word, `append*`/`create*` allocation verbs are used correctly, and `flatten*`/`tessellate*` are canonical domain terms. Good.
- `flattenPath` returning `number[][]` (and `tessellatePath` returning `number[]` buffers) is a reasonable plain-data shape, though a mature library would likely also offer a typed-array (`Float32Array`/`Uint32Array`) path for zero-copy GPU upload; the `PathMesh` doc comment even mentions "clean C/GPU upload" while using `number[]`.
- The absence of a `closePath`/close verb is a real shape gap, not just a missing convenience: closure is currently a heuristic (coincident endpoint) rather than authored intent, which is ambiguous for open vs. closed contours that legitimately end where they began.
- `tessellatePath` ignoring the path's `winding` rule is documented but is a correctness limitation for any path with holes — the winding rule is the standard mechanism for hole subtraction.

## Recommendation

Treat this as a **partial** package: a strong flattener + basic fill tessellator, but well short of an authoritative path library. The gaps here are overwhelmingly _missing-by-omission_, not missing-by-design — none of them conflict with the plain-data / free-function / tree-shakable style; they are simply unbuilt. Priorities to reach AAA completeness, roughly in order of canonical importance:

1. **Stroking** — `strokePath` → fillable outline (joins: miter/round/bevel; caps: butt/round/square; miter limit; dashing). This is the single biggest defining feature absent.
2. **Measurement/analysis** — `getPathBounds`, `getPathLength`, `getPathPointAtDistance`/tangent, `isPointInPath` (winding-aware), orientation/area.
3. **Transformation** — `transformPath`/`copyPath`/`reversePath` (out-param + alias-safe per SDK rules).
4. **Holes-aware triangulation** — extend `tessellatePath` to honor `winding` and bridge holes (earcut-style), so it is no longer strictly inferior to the stencil route for nested contours.
5. **Primitive + arc verbs at the path layer** — `appendPathArc`, `appendPathRectangle`, `appendPathEllipse`, and an explicit `closePath`/close verb; arc→bezier conversion.
6. **Boolean ops and SVG parse/serialize** — larger, can be surfaced as suggestions or a focused neighbor sub-package if scope warrants.

The existing code is a good foundation; the work is breadth of the geometric/editing surface, not rework of what is there.
