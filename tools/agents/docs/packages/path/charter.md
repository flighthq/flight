---
package: '@flighthq/path'
crate: flighthq-path
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# path — Charter

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

## What it is

`@flighthq/path` is the vector-path geometry primitive: the construction of 2D outline paths (the move/line/quadratic/cubic verb set, plus the higher-level primitives that expand into it — ellipse/circle/rect/round-rect/arc/SVG-arc/polygon/polyline) and the conversion of those outlines into renderer-consumable forms (flattened polyline contours, ear-clipped fill meshes, pooled typed meshes), alongside measurement (length, point/tangent at distance, signed area, orientation, segment evaluation), analysis (true bezier-extrema bounds, winding-rule point containment), and transformation (affine transform, translate, reverse, stroke-to-outline with joins/caps/dashing).

It is a **value-typed leaf**: plain `Path` data in, plain contours/meshes/scalars out, allocation confined to `create*`/`clone*`/`acquire*`, math/eval/transform writing to out-params. It owns the _shape_, not the _pixels_ — rendering, GPU upload, and stencil/cover orchestration belong to the `displayobject-<backend>` renderers downstream. Its primary in-SDK consumer is `@flighthq/clip` (which builds clip regions from `Path`), and it sits beside `@flighthq/geometry` (its only non-types dependency) and `@flighthq/math`. The Flash `GraphicsPath` command vocabulary is the verb model; the SVG path _string_ is a textual format it does not yet parse or serialize.

## North star (proposed)

_Proposed from the review + the SDK design constraints and structural forks — edit or reject._

- **A pure value-typed leaf.** Plain `Path` in, plain contours / meshes / scalars out. No runtime identity, no scene-graph participation, no hidden state. This is what makes `path` a near-zero-copy Wasm-mixable leaf (fork D / Mixing) and a prime first Rust↔TS conformance target — keep it that way.
- **The verb set is bedrock; higher primitives expand into it.** Arcs, ellipses, round-rects, and SVG endpoint-arcs all lower to the small move/line/quadratic/cubic verb vocabulary, so no `ARC` (or other) verb leaks to downstream consumers. The closed `PathCommand` union is the _correct_ call here (fork B's "tight loop within a closed system" exception): it is a fixed bedrock verb set, not a growing family.
- **Explicit allocation, alias-safe math.** `create*`/`clone*`/`acquire*` allocate; flatten / tessellate / measure / transform write into out-params or pooled meshes and stay safe when `out` aliases an input. Per-frame work stays off the allocator via the mesh pool.
- **Industry-canonical capability and naming.** Hold to the mature-path-library bar (Skia / Cairo / paper.js): full unabbreviated `Path` in every export, `get*`/`has*`/`is*` accessors, sentinel returns for expected failure. Completeness is judged against what a real path library offers.
- **Conformance-grade determinism.** Behavior is deterministic and headlessly fingerprint-able so the Rust `flighthq-path` crate can be checked 1:1 against this TS source.

## Boundaries (proposed)

_Proposed in-scope / non-goals — confirm, and especially settle the neighbor-package questions below._

**In scope (today):** path construction (verbs + primitives + arcs), conversion (flatten, ear-clip tessellate, typed mesh, mesh pool), measurement/analysis (length, point/tangent at distance, signed area, orientation, true bezier-extrema bounds, winding-rule containment, segment evaluators), transformation (affine transform, translate, reverse, stroke-to-outline with joins/caps/dashing), and the segment visitor (`forEachPathSegment`).

**Out of scope (proposed non-goals — open to revision):**

- **Rendering / GPU upload / stencil-then-cover orchestration** — owned by `displayobject-<backend>`.
- **The SVG DOM / SVG document model** — `path` is geometry, not a markup parser.
- **Color, paint, and material** — `path` produces fillable outlines/meshes; paint is the renderer's.

**Undecided boundary lines (these are the real questions — see Open directions):** boolean ops, SVG path-string round-trip, holes-aware triangulation, and a full `PathMeasure` surface each sit on a boundary the charter has not yet drawn. The structural-forks triad suggests `@flighthq/path-formats` (SVG codec) and `@flighthq/path-boolean` neighbors as the natural homes, but neither is blessed.

## Decisions

None blessed yet.

## Open directions

Every candidate question the stub charter does not yet answer. Each needs a bless-or-defer before it has a home to be settled in.

1. **Boolean path operations** (`unionPaths`/`intersectPaths`/`differencePaths`/`xorPaths`, Vatti / Martínez-Rueda) — the single largest capability gap. In-package, a `@flighthq/path-boolean` neighbor (the status's lean — keeps the algorithm weight off the geometry bundle), or out of scope? Passes the bedrock/upstream-oracle test (Skia `SkPathOps`, paper.js boolean exist as separately-factored work).
2. **SVG path-string parse/serialize** (`parseSvgPathData`/`serializeSvgPathData`) — a `@flighthq/path-formats` neighbor (the triad `-formats` layer), an in-package pair, or owned by a future `svg` importer? The data model and SVG-arc math are already here; only the string codec is missing. Passes the triad plurality guard only if a second textual path format is foreseen — otherwise a single in-package pair may be the honest call.
3. **Holes-aware / robust triangulation** — does `tessellatePath` stay a simple-polygon direct-fill route (holes handled by the renderer's stencil-then-cover path), or grow earcut hole-stitching, `path.winding` honoring, and a self-intersection-robust fallback (constrained-Delaunay / monotone)? This is a cross-package contract question with the `render-*` / `displayobject-<backend>` owners.
4. **`PathMeasure` shape** — a stateful cached measure entity (amortized, enabling text-on-path and length-driven animation) vs. the current pure re-flattening distance queries, plus the missing surface: `getPathContourLengths`, per-subpath measure, closest-point (`getPathNearestPoint`), curvature.
5. **`StrokeStyle` home** — promote the input descriptor (currently inline in `strokePath.ts`) into `@flighthq/types` as a header-layer type a renderer or higher layer can also author, or keep it inline? (Contract-fit nit today: crosses no package boundary yet.)
6. **Stroke semantics** — adopt global dash-phase continuity across subpaths and inner/outer stroke alignment (the SVG / Skia / PDF semantic), or bless the current per-subpath, center-only behavior as the intended scope?
7. **Path editing / simplification surface** — is `simplifyPath` (Douglas–Peucker), `fitPathCurves` (polyline→bezier), first-class `offsetPath` (outset/inset), and a standalone `dashPath` in scope, or deferred?
8. **Boundary statement** — fix the one-paragraph "what is explicitly _not_ `path`'s job" (rendering, GPU upload orchestration, the SVG DOM). Settling this would resolve 1–7 by precedent.
9. **Rust parity** — `flighthq-path` does not yet mirror the recent additions; `path` is the prime first conformance target (value-typed leaf, deterministic, headlessly fingerprint-able). Sequence it.
10. **Package Map entry** — the live codebase-map Package Map does not list `@flighthq/path` at all, though `@flighthq/types`'s `Path.ts` and `@flighthq/clip` both reference it. A missing-line fix, sited near `clip` (its primary consumer) and `geometry`. (Admin-doc gap surfaced by the review.)
11. **Internal decode-duplication refactor** — the same `PathCommand` stride-decode is re-implemented across ~8 files; `forEachPathSegment` centralizes it but most internal walkers do not use it. An internal refactor (not an API fork) — confirm whether to consolidate.
