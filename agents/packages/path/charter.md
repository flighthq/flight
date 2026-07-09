---
package: '@flighthq/path'
crate: flighthq-path
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# path — Charter

## What it is

`@flighthq/path` is the **vector-path geometry kernel**: the construction of 2D outline paths (the move/line/quadratic/cubic verb set, plus higher-level primitives that expand into it — ellipse/circle/rect/round-rect/arc/SVG-arc/polygon/polyline), conversion to renderer-consumable forms (flattened polyline contours, ear-clipped fill meshes, pooled typed meshes), measurement and analysis (length, point/tangent at distance, signed area, orientation, true bezier-extrema bounds, winding-rule point containment, segment evaluation), and transformation (affine transform, translate, reverse, stroke-to-outline with joins/caps/dashing).

It is a **value-typed leaf**: plain `Path` data in, plain contours/meshes/scalars out. It owns the _shape_, not the _pixels_. Its primary in-SDK consumers are `@flighthq/clip` (builds clip regions from `Path`), `@flighthq/shape` (uses path as its geometry kernel — curve constants, flattening), and `@flighthq/interaction` (uses `containsPathPoint` for shape-accurate picking). Dependencies: `@flighthq/types` only.

Where it ends: rendering, GPU upload, and stencil/cover orchestration belong to `displayobject-<backend>`. Boolean path operations (union/intersect/difference/XOR) belong in the `@flighthq/path-boolean` neighbor. Path-string codecs (SVG `d` attribute parse/serialize) belong in `@flighthq/path-formats`.

## North star

1. **A pure value-typed leaf.** Plain `Path` in, plain contours / meshes / scalars out. No runtime identity, no scene-graph participation, no hidden state. This is what makes `path` a near-zero-copy Wasm-mixable leaf and a prime first Rust↔TS conformance target.
2. **The verb set is bedrock; higher primitives expand into it.** Arcs, ellipses, round-rects, and SVG endpoint-arcs all lower to the small move/line/quadratic/cubic verb vocabulary. No `ARC` or other verb leaks to downstream consumers. The closed `PathCommand` union is the correct tight-loop exception to fork B — a fixed bedrock verb set, not a growing family.
3. **Explicit allocation, alias-safe math.** `create*`/`clone*`/`acquire*` allocate; flatten/tessellate/measure/transform write into out-params or pooled meshes and stay safe when `out` aliases an input.
4. **Industry-canonical capability and naming.** Hold to the mature-path-library bar (Skia / Cairo / paper.js): full unabbreviated `Path` in every export, `get*`/`has*`/`is*` accessors, sentinel returns for expected failure.
5. **Conformance-grade determinism.** Behavior is deterministic and headlessly fingerprint-able so the Rust `flighthq-path` crate can be checked 1:1 against this TS source.

## Boundaries

**In scope:**

- Path construction (verbs + primitives + arcs + SVG-arc).
- Conversion (flatten, ear-clip tessellate, typed-array mesh, mesh pool).
- Measurement and analysis (length, point/tangent at distance, signed area, orientation, true bezier-extrema bounds, winding-rule containment, segment evaluation).
- Transformation (affine, translate, reverse).
- Stroke-to-outline expansion (joins/caps/dashing) — producing a fillable outline path from a centerline + style.
- Path editing/simplification: `simplifyPath` (Douglas-Peucker decimation), `fitPathCurves` (Schneider polyline→bezier fitting), standalone `dashPath`. (Polygon offsetting moved to `@flighthq/path-boolean` — see Decisions.)
- Multiple tessellation strategies: simple (current `tessellatePath` for convex/simple polygons) and holes-aware (earcut + winding for compound shapes).

**Non-goals:**

- Rendering / GPU upload / stencil-then-cover orchestration (→ `displayobject-<backend>`).
- Boolean path operations — union/intersect/difference/XOR (→ `@flighthq/path-boolean`).
- SVG path-string parse/serialize (→ `@flighthq/path-formats`).
- The SVG DOM / SVG document model.
- Color, paint, and material — path produces fillable outlines/meshes; paint is the renderer's.

## Decisions

- **[2026-07-02] Boolean ops belong in `@flighthq/path-boolean` neighbor.** Union/intersect/difference/XOR (Vatti/Martinez-Rueda polygon clipping) are a separate `-boolean` neighbor package so the heavy algorithm weight stays off the core geometry bundle. Clip's `*Exact` functions consume this same kernel. The name `path-boolean` is the precise term — the operations ARE boolean algebra on 2D regions.

  **Why:** A user who only needs to flatten a curve shouldn't pay for polygon clipping in their bundle. The algorithm is genuinely heavy and independently testable. Same `-suffix` neighbor pattern as `particles-formats`, `spritesheet-formats`.

- **[2026-07-02] SVG path-string codec belongs in `@flighthq/path-formats`.** `parseSvgPathData`/`serializeSvgPathData` are pure string parsing (no DOM APIs). The `-formats` neighbor pattern applies. If SVG grows to a full document importer, that becomes a separate `@flighthq/svg`; the path-string codec alone is small and fits in `-formats`.

  **Why:** Same triad pattern as other `-formats` packages. Keeps regex/string-parsing weight off the geometry core.

- **[2026-07-02] `StrokeStyle` promoted to `@flighthq/types`.** Currently defined inline in `strokePath.ts`. As a pure input descriptor that renderers, shape, and higher layers may also author, it belongs in the header layer. Move to `@flighthq/types`.

  **Why:** Types should always live in types. `StrokeStyle` is a cross-package descriptor — shape records stroke style, path expands it, renderers consume it.

- **[2026-07-02] Path editing/simplification is in scope.** `simplifyPath` (Douglas-Peucker point reduction), `fitPathCurves` (Schneider polyline→bezier fitting), and standalone `dashPath` (dash a path without full stroke expansion) are standard path-library primitives and belong in this package.

  **Why:** These are canonical operations every mature path library provides (Skia, Cairo, paper.js). They are value-in/value-out, no cross-package coupling, and natural extensions of the existing surface.

- **[2026-07-09] Polygon offsetting reassigned to `@flighthq/path-boolean`.** The naive single-pass `offsetPath` that lived here (parallel edge-shift + miter join, no self-intersection cleanup) was **removed** — it produced self-intersecting, invalid geometry on any concave input or large distance, and offsetting is genuinely a CSG concern. The AAA offset now lives in `@flighthq/path-boolean` as `offsetPath(path, delta, options)` (all join/cap styles + miter limit + kernel self-union cleanup). Path keeps stroke-to-outline expansion (a different operation: centerline → both-sided fillable outline); it no longer offers a standalone region offset.

  **Why:** A correct offset requires the boolean kernel to dissolve the self-overlap that offsetting a concave corner creates. That kernel is path-boolean's, so the operation belongs there — keeping a cleanup-free duplicate in path was a bug surface, not a cheaper primitive.

- **[2026-07-02] Multiple tessellation strategies coexist.** Keep `tessellatePath` as the simple, fast, no-holes direct-fill route. Add a second function (e.g. `tessellatePathFilled` or `tessellatePathComplex`) that handles holes via earcut hole-stitching + winding. The caller picks which they need — simple shapes get the cheap path, compound/donut shapes get the correct one.

  **Why:** The simple tessellator shouldn't grow complex to handle holes. Two strategies, explicitly chosen, matches the conservative/exact stratification pattern from clip.

## Open directions

1. **PathMeasure shape.** Whether to add a stateful cached measure entity (amortized, enabling text-on-path and length-driven animation) vs. keeping the current pure re-flattening distance queries. The current pure functions are correct but re-flatten on every call. A `PathMeasure` entity would cache the flattened representation and amortize repeated queries. Needs discussion — affects the API shape for text-on-path, animation, and closest-point queries.

2. **Stroke dash-phase semantics.** Flash's `Graphics.lineStyle` resets per `moveTo` — each subpath is independent. SVG/Skia/Cairo/PDF continue the dash pattern globally across subpaths. The current code matches Flash (per-subpath reset). Whether to adopt the SVG/Skia global semantic, keep Flash behavior, or make it configurable via `StrokeStyle` (`dashContinuity: 'perSubpath' | 'global'`). Inner/outer stroke alignment (vs. center-only) is also unsettled.

3. **Package description update.** The current description ("Vector path geometry: curve flattening and tessellation of GraphicsPath outlines") understates the package — it's now construction + conversion + measurement + analysis + transformation + stroking. Should be updated to reflect the full surface.

4. **Rust `flighthq-path` crate.** Prime first conformance target (value-typed leaf, deterministic, headlessly fingerprint-able). Not yet mirrored. Sequenced after TS surface stabilizes.
