---
package: '@flighthq/path'
status: solid
score: 88
updated: 2026-06-24
ingested:
  - status.md
  - source
  - changes.patch
---

# path — Review

> Survey layer. Evidence: `incoming/builder-67dc46d64/head/packages/path/` + `changes.patch`. Prior depth review (`reviews/depth/path.md`) no longer present in the tree — already migrated; superseded here. Charter is a stub (only "What it is" seeded), so this review falls back to the codebase-map AAA standard and flags each silence as a candidate Open direction.

## Verdict

`solid — 88/100`. `@flighthq/path` is a genuinely mature, well-factored vector-path geometry library: construction (lines/quadratics/cubics, ellipse/circle/rect/round-rect/arc/SVG-arc/polygon/ polyline), conversion (flatten, ear-clip tessellate, typed-array mesh, pooled meshes), measurement (length, point/tangent at distance, signed area, orientation, segment evaluation), analysis (true bezier-extrema bounds, point containment via winding rule), and transformation (affine transform, translate, reverse, stroke-to-outline with joins/caps/dashing). Every one of 42 exported functions across 16 source files carries a colocated test (144 tests). The gap to authoritative is a small set of real-library features that are deliberately deferred as cross-package or new-package decisions: boolean ops, SVG path string parse/serialize, holes-aware triangulation, path simplification/curve fitting, and a full `PathMeasure` surface. The status doc's claims verify against the diff. The self-assessed 91 is slightly generous given those genuine gaps; 88 is the honest directional score.

## Status-doc verification (as-claimed → verified)

The status doc is **mostly accurate**. Spot-checks against source and `changes.patch`:

- **`getPathSegmentAtParameter.ts` and `pathMeshPool.ts` are net-new files** (diff shows `--- /dev/null`), confirming the claimed "Pass 2" segment-evaluation and pooling work landed. `tessellatePath.ts` is _not_ in the added-file set — it pre-existed and was only modified, matching the "Pass 2 builds on Pass 1" framing.
- **All Bronze/Silver/Gold functions named in the status exist** with the claimed signatures (`appendPathArc`/`appendPathArcTo`/`appendPathRoundRectangle`, the four pool functions, the six bezier/segment evaluators, `strokePath` with dashing). Verified by export grep.
- **Test count is exact**: 144 `it()` across 16 `*.test.ts`. Claimed.
- **Types in `@flighthq/types` are real**: `PathCommand.CLOSE = 7`, `PathSegment` discriminated union, `PathMeshTyped` (Float32Array/Uint32Array) all present in `head/packages/types/src/`.
- **One naming discrepancy in the status table**: it lists `getPathContourOrientation` under `getPathSignedArea.ts` with return `'ccw' | 'cw' | 'degenerate'` — verified, both functions live in that file and the file name follows the area concept, not the orientation export. Minor; the export is correctly tested under its own `describe`.

The status's self-scored **91/100** is optimistic. Its own dimension table sums to **86**, then revises to 91 by arguing the deferred items are "user-decision" rather than "incomplete." That reframing is fair for _autonomy_ but not for _completeness_ — a mature path library (Skia, Cairo, paper.js, SVG) _has_ boolean ops and string round-trip. They are missing capability regardless of who decides to add them. 88 splits the difference.

## Present capabilities

Grounded in `head/packages/path/src/`:

**Construction (`path.ts`)** — `createPath` (winding default `nonZero`), low-level verb appends (`appendPathMoveTo/LineTo/CurveTo/CubicCurveTo/Close`), primitives (`appendPathCircle`, `appendPathEllipse` via 4-cubic KAPPA≈0.5523 approximation, `appendPathRectangle`, `appendPathRoundRectangle` with scalar-or-`[tl,tr,br,bl]` radii clamped to half-edge, `appendPathPolygon`/`appendPathPolyline` from flat coordinate arrays), and arcs (`appendPathArc` center-parameterized with ≤π/2 cubic segments and `anticlockwise`/`connectToCurrent` flags; `appendPathArcTo` implementing the full SVG §F.6 endpoint→center parameterization with radius scaling §F.6.6.3 and signed `vectorAngle` §F.6.5.6). Arc-as-cubic-expansion keeps the verb set small — no `ARC` verb leaks to downstream consumers.

**Conversion** — `flattenPath` (adaptive subdivision to `number[][]` contours), `tessellatePath` (`tessellatePath.ts`, ear-clipping per contour into `PathMesh` with a guarded clip loop and coincident-point dedup), `tessellatePathTyped` (`PathMeshTyped`), and a pool bracket (`acquirePathMesh`/`releasePathMesh`, `acquirePathMeshTyped`/`releasePathMeshTyped`, `pathMeshPool.ts`, high-water cap 64).

**Measurement / analysis** — `getPathLength`, `getPathPointAtDistance`/`getPathPositionAtDistance`/ `getPathTangentAtDistance` (single flatten pass, clamped at both ends), `getPathSignedArea` + `getPathContourOrientation` (shoelace), `getPathBounds` (true bezier extrema by solving B'(t)=0, not control-hull — a real maturity marker), `containsPathPoint` (winding-rule point test honoring `evenOdd`/`nonZero`), and the segment evaluators (`getPathSegmentPointAtParameter`/`...Tangent...` plus standalone `getCubic/QuadraticBezierPoint/Tangent` — all out-param into `Vector2Like`).

**Transformation** — `transformPath`/`translatePath` (alias-safe affine; copies commands first to handle `out === source`), `reversePath`, and `strokePath` (`strokePath.ts`, centerline→fillable outline: miter/round/bevel joins with miter-limit fallback to bevel, butt/round/square caps, dash pattern with `dashOffset`, all pre-flattened then offset).

**Visitor** — `forEachPathSegment` over the `PathSegment` union; the canonical decode that normalizes `WIDE_MOVE_TO`/`WIDE_LINE_TO` to their standard verbs and skips `NO_OP`.

## Gaps

Measured against a mature path library (the codebase-map AAA fallback, since the charter is silent):

- **Boolean / path overlay** — no `unionPaths`/`intersectPaths`/`differencePaths`/`xorPaths` (Vatti / Martínez-Rueda). The single largest capability gap; every mature library has it.
- **SVG path string round-trip** — no `parseSvgPathData`/`serializeSvgPathData`. The data model and the SVG-arc math are already here; only the string codec is missing.
- **Holes-aware triangulation** — `tessellatePath` triangulates each contour independently and explicitly does _not_ subtract holes or honor `path.winding` ("a hole contour fills solid"). A concave outline works; a donut does not. Documented in source as out of scope for the direct-fill route.
- **Self-intersection robustness** — ear-clipping bails (`if (!clipped) break`) on self-intersecting polygons rather than resolving them; no constrained-Delaunay / monotone fallback.
- **Full `PathMeasure` surface** — no `getPathContourLengths`, no per-subpath measure object, no closest-point-on-path (`getPathNearestPoint`), no curvature query. The distance-based queries re-flatten the whole path each call (no cached measure), which is correct but not amortized.
- **Path editing/simplification** — no `simplifyPath` (Douglas–Peucker), no `fitPathCurves` (polyline→bezier), no `offsetPath` as a first-class outset/inset (only stroke-to-outline exists), no `dashPath` exposed independently of `strokePath`.
- **Stroke completeness** — stroke alignment is center-only (no inner/outer); the dash pattern **resets at each subpath** rather than continuing globally (the SVG/Skia/PDF semantic), a known limitation the tests pin; no hairline/sub-pixel codepath.
- **`getPathLastPoint` is O(n)** — `appendPathArcTo` rescans the whole command stream to find the pen position on each call. Negligible for typical use, quadratic for arc-heavy programmatic building.
- **Rust parity** — `flighthq-path` does not yet mirror these additions. The status flags it; it is a prime first conformance target (value-typed leaf, deterministic, headlessly fingerprint-able) per the Mixing fork.

## Charter contradictions

**None** — the charter has no North star, Boundaries, or Decisions yet (only a seeded "What it is"). Nothing to contradict. The package is fully consistent with the _codebase-map_ design constraints it falls back to: full unabbreviated `Path` in every function name, out-params for the math/eval/transform functions, allocation confined to `create*`/`clone*`/`acquire*`, alias-safe transforms (verified in `transformPath`/`reversePath`), `Readonly<>` on all read-only inputs, sentinel returns (`false` for out-of-range segment index and empty-path bounds; `null` internally; no throws), `sideEffects: false`, single root `.` export. This is a model citizen for the conventions.

## Contract & docs fit

**(a) How well the package lives up to the contract** — strong.

- **`@flighthq/types`-first**: `Path`, `PathCommand`, `PathWinding`, `PathSegment`, `PathMesh`, `PathMeshTyped`, `Vector2Like`, `MatrixLike`, `RectangleLike` are all imported from `@flighthq/types` — no cross-package types defined inline. The one exception is **`StrokeStyle`, defined inline in `strokePath.ts`** rather than in `@flighthq/types`. Since `strokePath` returns a `Path` and `StrokeStyle` is a pure input descriptor that a renderer or a higher layer may also want to author, this is a candidate to promote into the header layer — flag as a contract-fit nit, not a violation (it crosses no package boundary today).
- **Naming / verbs / out-params / sentinels / `Readonly<>` / single export / `sideEffects:false`**: all satisfied (see Charter contradictions).
- **Tests**: one colocated `*.test.ts` per source file; `describe` blocks alphabetized and mirroring exports (verified for `path.test.ts`). `exports:check` should pass clean.
- **Rust mirror**: `crate: flighthq-path` is expected (identity); not yet built (gap above).

**(b) Where the contract / admin docs are stale against the work** — two candidate revisions:

1. **The live codebase-map Package Map does not list `@flighthq/path` at all.** `@flighthq/clip` and `@flighthq/math` have entries; `path` does not — yet `@flighthq/types`'s `Path.ts` doc explicitly says "`@flighthq/path` flattens/tessellates it," and `clip` consumes `Path`. This is a missing Package Map line, not a naming drift. **Candidate revision: add a `@flighthq/path` entry** describing the construction/conversion/measurement/transform surface, sited near `clip` (its primary consumer) and `geometry`.
2. **No charter direction exists** (`lastDirection: null`, North star / Boundaries / Decisions all TODO). For a package this built-out, the absence of a Boundary statement is the main structural risk — the boolean-ops / SVG-formats / `PathMeasure` decisions below have no home to be settled in. (See candidate Open directions.)

## Structural-forks fit

- **Fork B (closed union vs. open registry)**: the verb dispatch is a closed `if/else` over `PathCommand`, repeated across ~8 files (`getPathBounds`, `transformPath`, `containsPathPoint`, `forEachPathSegment`, `strokePath`'s decode, `walkPathSegment`, `getPathLastPoint`, flatten). This is the **correct** call here, not a fork violation: `PathCommand` is a fixed, bedrock verb set (the Flash command vocabulary), not a growing family, and each decoder is a tight stride-walk loop where fork B's "tight loop within a closed system may keep a closed union" exception applies. The smell is _decode duplication_ (the same commands/data stride decode re-implemented per file), which `forEachPathSegment` was partly introduced to centralize but most internal walkers do not use it — an internal-refactor candidate, not an API fork.
- **Fork D / Mixing**: `path` is explicitly named in the Rust-port Mixing doc as a value-typed, near-zero-copy mixable leaf (`path` tessellation). No hot-loop inflation: the pool functions keep per-frame allocation off the flatten/tessellate path. Consistent with the fork.
- **Triad (subject decomposition)**: a `path-formats` (SVG string codec) and a `path-boolean` neighbor are the natural triad/neighbor splits, each passing the plurality/upstream-oracle test (Skia's `SkPathOps`, paper.js boolean, SVG parsers all exist as separately-factored upstream work). These are new-package decisions — surfaced below, not acted on.

## Candidate open directions

These are the questions the stub charter does not answer that this review had to assume. Each should feed the charter's Open directions for the user to settle:

1. **Boolean path operations** — in-package, a `@flighthq/path-boolean` neighbor, or out of scope? The status recommends a neighbor package (keeps Vatti/Martínez weight off the geometry bundle). Needs a bless-or-defer.
2. **SVG path-string parse/serialize** — `@flighthq/path-formats` neighbor (the triad `-formats` layer), in-package, or owned by a future `svg` importer? The arc math is already here; only the codec is missing. Passes the plurality guard only if a second textual path format is foreseen (otherwise a single in-package pair may be the honest call).
3. **Holes-aware / robust triangulation** — does `tessellatePath` stay a simple-polygon direct-fill route (holes handled by the renderer's stencil-then-cover path), or does it grow earcut hole-stitching and winding-rule honoring? This is a cross-package contract question with `render-*` owners.
4. **`PathMeasure` shape** — a stateful cached measure entity vs. the current pure re-flattening functions. Affects whether text-on-path and length-driven animation get an amortized API.
5. **`StrokeStyle` home** — promote to `@flighthq/types` (header-layer descriptor) or keep inline?
6. **Stroke semantics** — adopt global dash-phase continuity across subpaths (SVG/Skia) and inner/outer stroke alignment, or bless the current per-subpath, center-only behavior as the intended scope?
7. **Boundary statement** — what is explicitly _not_ `path`'s job (rendering, GPU upload orchestration, the SVG DOM)? A one-paragraph Boundaries section would settle 1–6 by precedent.
