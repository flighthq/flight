---
package: '@flighthq/path'
status: solid
score: 90
updated: 2026-07-13
ingested:
  - status.md
  - charter.md (2026-07-09 decisions)
  - prior review.md (2026-06-24) + assessment.md (2026-07-02)
  - source (packages/path/src, all 22 source files + 22 test files)
  - consumer grep (clip, displayobject-gl/wgpu, motionpath, path-boolean, path-formats)
---

# path — Review

> Rereview against live source. Supersedes the 2026-06-24 bundle review, which predated the path-boolean/path-formats siblings, the kernel-dependency decision, and the editing-family additions (`decimatePath`, `cleanPath`, `fitPathCurves`, `dashPath`, `getPathNearestPoint`, `getPathContourLengths`).

## Verdict

`solid — 90/100`. A mature, contract-exemplary vector-path geometry kernel: 48 exported functions across 22 source files, 191 colocated tests, `@flighthq/types` only. Since the prior review (88), the blessed sweep landed almost in full and the boolean/codec weight moved to the `path-boolean`/`path-formats` siblings, sharpening this package to exactly its chartered kernel-free scope. What holds it below authoritative: one real bug (`dashPath` claims alias-safety it does not have), a mesh pool that does not actually eliminate per-acquire allocation, the blessed-but-unbuilt holes-aware tessellator (charter Decision 2026-07-02, "Multiple tessellation strategies"), and the one approved sweep item that never landed (walker/flatten decode dedup).

## Present capabilities

- **Construction** (`path.ts`) — `createPath` (winding default `nonZero`), verb appends (`appendPathMoveTo/LineTo/CurveTo/CubicCurveTo/Close`), primitives (`appendPathCircle`/`Ellipse` via KAPPA 4-cubic, `Rectangle`, `RoundRectangle` with scalar-or-per-corner radii clamped to half-edge, `Polygon`/`Polyline`), arcs (`appendPathArc` center-param, ≤π/2 cubics, anticlockwise/connect flags; `appendPathArcTo` full SVG §F.6 endpoint→center with radius scaling). No `ARC` verb leaks — North star #2 holds. `getPathLastPoint` is now O(1) (tail-of-data read) — the prior O(n) finding and approved item #1 are resolved.
- **Conversion** — `flattenPath` (adaptive de Casteljau, depth-capped, explicit CLOSE closure), `tessellatePath` (ear-clip per contour, coincident-point dedup, CCW normalization, guarded clip loop), `tessellatePathTyped`, and the pool bracket (`acquirePathMesh(Typed)`/`releasePathMesh(Typed)`, high-water 64).
- **Measurement / analysis** — `getPathLength`, `getPathContourLengths`, `getPathPointAtDistance`/`getPathTangentAtDistance`/`getPathPositionAtDistance` (clamped, single flatten pass), `getPathNearestPoint` (closest point, returns distance, `-1` sentinel), `getPathSignedArea` + `getPathContourOrientation` (shoelace), `getPathBounds` (true bezier extrema via B′(t)=0), `containsPathPoint` (nonZero/evenOdd winding test with curve subdivision), segment evaluators (`getPathSegmentPointAtParameter`/`...Tangent...`, standalone `getCubic/QuadraticBezierPoint/Tangent`).
- **Transformation / editing** — `transformPath`/`translatePath` (alias-safe), `reversePath` (control re-pairing, built on `forEachPathSegment`), `strokePath` (miter/round/bevel joins with miter-limit fallback, butt/round/square caps, dashing; `StrokeStyle` now lives in `@flighthq/types` — Decision #3 satisfied), `dashPath` (standalone dash split), `decimatePath` (Douglas-Peucker; the rename ceding "simplify" to path-boolean is done), `cleanPath` (kernel-free coincident/collinear/spike vertex dedup with closed-seam wrap handling), `fitPathCurves` (Schneider least-squares with corner partitioning, Newton-Raphson reparameterization).
- **Visitor** — `forEachPathSegment`, the canonical decode normalizing WIDE_* verbs.
- **Siblings honored** — every op here is kernel-free per the 2026-07-09 kernel-dependency decision; `offsetPath`/`simplifyPath`/booleans correctly live in `@flighthq/path-boolean`, SVG `d` codec in `@flighthq/path-formats`. path-boolean builds its outputs through this package's appenders and `flattenPath` — the kernel role is real, not aspirational.

## Gaps

Vs. a textbook path library (Skia/Cairo/paper.js), excluding codec/boolean gaps that belong to the siblings:

- **`dashPath` alias bug.** Doc comment says "Alias-safe", but it clears `out.commands`/`out.data` *before* calling `flattenPath(source)` (`dashPath.ts` lines 18–28) — `dashPath(p, dash, 0, p)` empties the path. `decimatePath`/`cleanPath`/`fitPathCurves` flatten first (correct order). No aliased-case test exists for any of the four; testing conventions require one per out-param function (only `cleanPath` and `transformPath`/`translatePath` have them).
- **The pool does not remove allocation.** `acquirePathMesh` calls `tessellatePath` (which allocates fresh `number[]`s) then copies into the pooled mesh; `acquirePathMeshTyped` pools only the wrapper and reallocates both typed arrays (the source comment admits it). The missing primitive is an out-param tessellate (`tessellatePath` writing into an existing `PathMesh`); without it the pool's stated purpose — no per-frame heap allocation — is not met.
- **Holes-aware tessellation** — `tessellatePath` still fills each contour independently ("a hole contour fills solid"); the second, winding-honoring strategy blessed in the charter (Decision "Multiple tessellation strategies coexist") is unbuilt. Self-intersecting contours still bail (`if (!clipped) break`).
- **Decode duplication (approved item #2, not landed).** `flattenQuadratic`/`flattenCubic`/chord-distance are implemented three times (`flattenPath`, `strokePath`, `containsPathPoint`), and the verb/stride walk appears in ~6 files; `strokePath`'s private `applyDash` also duplicates the dash walk `dashPath` now owns publicly. Only `reversePath` uses `forEachPathSegment`.
- **`getPathLastPoint` post-CLOSE semantics.** The O(1) tail read returns the last anchor *before* a CLOSE, but the SVG pen position after CLOSE is the subpath start — so `appendPathArcTo` after a closed contour continues from the wrong point.
- **Measure-family absences** — no curvature query (`getPathCurvatureAtDistance` or per-segment at t), no sub-range extraction (`splitPathAtDistance`/extract-range — Skia `SkPathMeasure::getSegment`, paper.js `splitAt`; the primitive behind Lottie trim-paths, relevant to fork I), no cached `PathMeasure` (open direction #1; every distance query re-flattens).
- **Stroke completeness** — dash phase still resets per subpath (open direction #2), alignment is center-only, no hairline codepath. `strokePath` also builds its result via an object literal instead of `createPath()` (style nit).
- **Rust `flighthq-path`** — still not mirrored (open direction #4); the package remains the prime first conformance target.

## Charter contradictions

**None.** The 2026-07-09 kernel-dependency line is cleanly realized: nothing here needs the sweep kernel, `decimatePath`/`cleanPath` naming matches the decision, the removed naive `offsetPath` is gone, `StrokeStyle` moved to types per Decision #3. The closed `PathCommand` union remains the blessed bedrock exception to fork B (North star #2).

## Contract & docs fit

**(a) Package vs. contract — strong.** Types header-first (`Path`, `PathCommand`, `PathSegment`, `PathMesh(Typed)`, `StrokeStyle` all in `@flighthq/types`); full unabbreviated names; out-params with locals-first alias safety (except the `dashPath` bug above); sentinels not throws (`false`, `-1`, `'degenerate'`); single root export; `sideEffects: false`; one test file per source file, describes mirroring exports.

**(b) Docs stale against the work — three candidate revisions:**

1. **`package.json` description** still reads "curve flattening and tessellation of GraphicsPath outlines" — pre-dates the whole surface and names a type (`GraphicsPath`) that no longer exists. Open direction #3 already flags this; it remains unfixed.
2. **Package Map line** (`agents/index.md`) omits the editing family (decimate/clean/fit/dash/nearest-point) and says "consumed by clip/shape/interaction" — but source grep shows the actual consumers are `clip`, `displayobject-gl/wgpu`, `motionpath`, `path-boolean`, `path-formats`; `shape` and `interaction` no longer import `@flighthq/path` (shape shares only types via `@flighthq/types`).
3. **Charter "What it is"** repeats the same shape/interaction consumer claim — same staleness, user's gate to amend.

## Candidate open directions

1. **Sub-range extraction / trim paths** — `splitPathAtDistance`/`getPathSegmentRange`. Kernel-free, measure-family, and the primitive `lottie-formats` (fork I) will need for trim-path animation. Should this land ahead of the importer?
2. **Path interpolation / morphing** (`interpolatePaths` for shape tweening) — real feature of mature vector runtimes; home is unclear (path vs. tween/animation binding layer). Needs a ruling before anyone builds it.
3. **Out-param tessellation seam** — an `out`-writing tessellate is implied by North star #3 and the pool's stated purpose; confirming it as the intended shape would also serve the Rust/Wasm zero-copy story.
4. Existing open directions #1 (PathMeasure), #2 (dash phase/alignment), #3 (description), #4 (Rust crate) all remain live; none were settled by the recent work.
