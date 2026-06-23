---
id: path
title: '@flighthq/path'
type: depth
target: path
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/depth/path.md
  - tools/agents/docs/reviews/depth/path.md
depends_on: []
updated: 2026-06-23
---

## Summary

partial — completeness 38/100; a strong curve flattener plus a basic ear-clipping fill tessellator, but well short of an authoritative path library (the entire analytic, transform, stroking, and boolean surface is missing-by-omission).

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum viable, genuinely-useful path library: authored closure, the transform/copy verbs every consumer needs, bounds, segment iteration, and a typed-array output path. These are the small, dependency-free additions that unblock the most callers.

- **Authored closure (header + builder).** Add `CLOSE` to the `PathCommand` set in `@flighthq/types` (consumes 0 data values). Add `appendPathClose(path)`. Resolve the depth-review ambiguity: open vs. closed contours become authored intent, not a coincident-endpoint heuristic. Update `flattenPath` and `tessellatePath` to honor an explicit close flag per contour (extend the flattener's `number[][]` result to carry closed-ness, or pair it with a `closed: boolean[]` — decide the contour-result shape now, in `@flighthq/types`, since both consumers and the Rust crate depend on it).
- **`copyPath(source, out?)` / `clonePath(source)`.** Allocation-explicit duplication (`clone*` allocates; `copy*` writes into an `out` `Path`). Foundation for every non-mutating transform.
- **`transformPath(source, matrix, out)`.** Apply a `Matrix` (`@flighthq/geometry`) to all control/anchor points; alias-safe (`out` may be `source`). Add `translatePath(source, dx, dy, out)` and `scalePath` as thin wrappers if useful.
- **`getPathBounds(path, out)`.** Axis-aligned `Rectangle` (`@flighthq/geometry`) over the _outline_, including curve extrema (true bezier extrema, not just control-point hull — controls overshoot). The single most-requested analytic query; needed for culling and layout.
- **`appendPathRectangle(path, x, y, width, height)`** and **`appendPathEllipse(path, cx, cy, radiusX, radiusY)`** / **`appendPathCircle`.** The two most common primitives, authored at the path layer (today they only exist one layer up in `@flighthq/shape`). Ellipse via the standard 4-cubic kappa approximation.
- **`forEachPathSegment(path, visitor)`** (or `createPathSegmentIterator`) — a public walk over `(verb, points)` so consumers stop re-implementing the `commands`/`data` stride decode that `flattenPath` does internally.
- **Typed-array tessellation output.** Add `PathMeshFloat` (or a `tessellatePathTyped` variant) returning `Float32Array` vertices + `Uint32Array` indices for zero-copy GPU upload — the `PathMesh` doc comment already promises "clean C/GPU upload" while using `number[]`. Decide whether `PathMesh` itself migrates or a sibling type is added (header-layer decision).

Effort: small–medium. No new dependencies; `transformPath`/`getPathBounds` pull in `@flighthq/geometry`. All have direct Rust mirrors.

### Silver

Competitive and solid — matches a well-regarded path library (Skia `SkPathMeasure`, kurbo, paper.js) for common professional use: stroking, measurement, hit testing, arcs, and holes-aware fill.

- **Stroking — the single biggest defining absence.** `strokePath(path, options, out)` → a fillable outline `Path` (closed contours). `StrokeStyle` type in `@flighthq/types`: `width`, `join` (`'miter' | 'round' | 'bevel'`), `cap` (`'butt' | 'round' | 'square'`), `miterLimit`, optional `dash: number[]` + `dashOffset`. Centerline offsetting with correct join/cap geometry. This is the natural companion to the existing fill tessellator and the most-requested missing feature.
- **Path measurement / `PathMeasure` family.** `getPathLength(path)`; `getPathPointAtDistance(path, distance, out)` (point); `getPathTangentAtDistance(path, distance, out)` (unit tangent / angle); `getPathPositionAtDistance` returning both. Cumulative arc-length table over flattened segments. Enables text-on-path, dashing, and animation-along-path.
- **Winding-aware hit testing.** `isPointInPath(path, x, y)` honoring the path's `winding` (nonZero vs evenOdd) — the standard ray-cross / signed-crossing test over flattened contours. Companion `getPathContourOrientation(contour)` (CW/CCW via signed area) and `getPathSignedArea(path)`.
- **Holes-aware triangulation.** Extend `tessellatePath` to honor `path.winding` and bridge holes (earcut-style hole-stitching of nested counter-wound contours), so the direct-fill route is no longer strictly inferior to the flatten+stencil route for nested contours. Resolves the documented winding/holes limitation.
- **Arc verbs and arc→bezier conversion.** `appendPathArc(path, cx, cy, radius, startAngle, endAngle, anticlockwise)` and SVG-style `appendPathArcTo(path, rx, ry, xAxisRotation, largeArc, sweep, endX, endY)`. Either add an `ARC` verb to `PathCommand` (and teach flatten/tessellate to consume it) or convert to cubics on append — decide once at the header layer (cubic-expansion keeps the verb set small and the consumers unchanged; an arc verb keeps the authored data exact). `appendPathRoundRectangle(path, x, y, w, h, radiusX, radiusY)`.
- **`reversePath(source, out)`** (alias-safe) and **`appendPathPolygon(path, points)`** / **`appendPathPolyline`** convenience builders.
- **Curve evaluation primitives.** `getPathSegmentPointAtParameter` (point at t on a bezier), tangent/derivative at t — the analytic backbone reused by measurement and stroking.

Effort: medium–large. Stroking and holes-aware triangulation are the heavy items; measurement/hit-test are medium. Pulls `@flighthq/geometry` (Matrix/Rectangle/Vector) harder. Surface a design decision (arc verb vs. cubic expansion) before implementing.

### Gold

Authoritative / AAA — the canonical reference for 2D path geometry. Exhaustive coverage, robustness, performance, full edge-case handling, and 1:1 Rust parity.

- **Boolean / clipping operations.** `unionPaths`, `intersectPaths`, `differencePaths`, `xorPaths` over a robust polygon overlay (Vatti / Martínez-Rueda style) producing winding-correct result `Path`s. The defining frontier feature of a mature path library. Likely warrants a focused neighbor package `@flighthq/path-boolean` (or `-clip`) if it carries weight or a numeric-robustness dependency — keep the core `path` tree-shakable.
- **SVG path-data parse / serialize — `@flighthq/path-formats` neighbor package.** `parseSvgPathData(d): Path` and `serializeSvgPathData(path): string` (the "-formats" importer/parser pattern, mirroring `@flighthq/spritesheet-formats`). Keeps the regex/string-parsing weight off the geometry core's bundle. Round-trip-tested against the SVG arc/relative/shorthand command grammar.
- **Path simplification & curve fitting.** `simplifyPath(path, tolerance, out)` (Douglas–Peucker decimation of flattened contours); `fitPathCurves(points, tolerance): Path` (Schneider polyline→bezier fitting) so a flattened/scanned outline can be re-curved.
- **Robustness & numeric edge cases.** Self-intersecting contour triangulation (replace ear-clipping with a constrained-Delaunay / monotone-decomposition path, or document the stencil route as canonical for self-intersection); degenerate-segment, zero-length, collinear, and near-coincident handling with explicit epsilon policy; NaN/Infinity input as sentinel-returning (`null`/empty mesh) per the throw-only-on-misuse rule.
- **Performance & allocation discipline.** Typed-array throughout (`Float32Array`/`Uint32Array`) as the first-class path, with `number[]` interop helpers; pooled scratch buffers (`acquirePathMesh`/`releasePathMesh`) for the per-frame flatten/tessellate hot loop; benchmark suite gating regressions.
- **Stroking completeness.** Inner/outer/center stroke alignment, dash phase across subpaths, round-join arc tessellation tolerance tied to the same `tolerance` parameter, hairline (sub-pixel) stroking, and stroke-then-fill that matches the renderer backends visually (functional-test parity across Canvas/DOM/WebGL).
- **Full measurement surface.** `getPathContourLengths`, segmented `PathMeasure` over individual subpaths, closest-point-on-path (`getPathNearestPoint`), and curvature query.
- **Signals (only if a live use emerges).** No mutable-path-observation case exists today; if an editing/authoring tool layer ever needs change notification, gate it behind an `enablePathSignals` group in this package — do not add it speculatively.
- **1:1 Rust parity.** Every Gold function ported to `flighthq-path` with conformance-tested output (the value-typed leaf nature of `path` makes it a prime mixing/conformance target — deterministic, no GPU, headlessly fingerprint-able per the Rust mixing doc). Boolean ops and SVG parse must match TS bit-for-bit on the conformance corpus.

Effort: large. Boolean ops and robust self-intersection triangulation are research-grade; SVG formats and simplification/fitting are medium-large. Each is independently shippable.

## Sequencing & effort

Recommended order, with dependencies and cross-package / design-decision items called out.

1. **Header-layer decisions first (blocks everything).** In `@flighthq/types`: (a) add `CLOSE` to `PathCommand` and define the flattener's closed-contour result shape; (b) decide the typed-array story for `PathMesh` (migrate vs. sibling `PathMeshFloat`); (c) decide arc representation (`ARC` verb vs. cubic expansion). These three shape the whole API and the Rust mirror — settle them before writing Bronze code.
2. **Bronze build order:** `appendPathClose` (+ flatten/tessellate close-handling) → `copyPath`/`clonePath` → `transformPath`/`translatePath` → `getPathBounds` (curve-extrema) → `forEachPathSegment` → primitive builders (`appendPathRectangle`/`appendPathEllipse`/`appendPathCircle`) → typed-array output. Each is small and independently testable (one colocated `*.test.ts` per source file, `describe` blocks alphabetized).
3. **Dependency note:** `transformPath`, `getPathBounds`, and all later measurement/stroking work add `@flighthq/geometry` (`Matrix`, `Rectangle`, `Vector`) as a runtime dependency — currently the package depends only on `@flighthq/types`. Add it to `package.json` and `tsconfig.json` references, then run `npm run packages:check`.
4. **Silver build order:** segment-iteration + curve-evaluation primitives (Bronze gives the iterator; add point/tangent-at-t) → measurement (`getPathLength`, `*AtDistance`) → `isPointInPath`/orientation/area → holes-aware `tessellatePath` → arcs → **stroking last** within Silver (it reuses curve-eval, joins benefit from arc tessellation). Stroking is the headline feature but sits on the most prerequisites.
5. **Silver design decision to surface:** arc verb vs. cubic expansion (item 1c) and whether `tessellatePath` gaining holes makes the `flattenPath`+stencil route redundant for the renderers — coordinate with `@flighthq/render-*` owners before changing the contract that clip regions / shape fills consume.
6. **Gold neighbor-package decisions (cross-package, surface to user):** boolean ops → `@flighthq/path-boolean` and SVG parse/serialize → `@flighthq/path-formats`. Both keep weight off the tree-shakable core; both are "create a new package" decisions that should be raised rather than taken autonomously (copy a nearby package shape, run `npm run packages:check`).
7. **Rust parity runs alongside each tier, not after.** `flighthq-path` mirrors the same files today; keep it in lockstep so the conformance corpus grows tier-by-tier. The value-typed leaf nature makes `path` an early, high-value conformance/mixing target — prioritize fingerprint-tested parity on the deterministic Bronze/Silver functions.
8. **Cross-package opportunity to flag:** the primitive builders (`appendPathRectangle`/`appendPathEllipse`/`appendPathRoundRectangle`) overlap with `@flighthq/shape`'s existing `appendShape*` helpers. Decide whether shape's primitives should delegate down to the path layer once it owns them (de-duplication), and raise it with the shape owner rather than forking two implementations.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- _(none captured yet)_

## Agent brief

> Build `@flighthq/path` up to the **Bronze** tier per the Scope + Design above (the package exists — extend it). Define any new shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions. Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
