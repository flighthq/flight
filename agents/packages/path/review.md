---
package: '@flighthq/path'
status: solid
score: 89
updated: 2026-09-02
ingested:
  - status.md (2026-08-08)
  - charter.md (2026-08-02 decisions, open directions)
  - prior review.md (2026-07-13, score 90) + assessment.md (2026-08-02)
  - source (packages/path/src, all 28 source files + 28 test files)
  - package.json (exports, dependencies, sideEffects)
  - consumer grep (clip, font, interaction, motionpath, path-boolean, path-formats, scene2d-formats, scene2d-gl/wgpu, shape, skeleton2d, swf, timeline)
  - types surface (StrokeStyle, PathMorph, PathMorphCreationExplanation, StrokePathTessellationExplanation, PathSegment, Path, PathMesh, PathMeshTyped)
---

# path -- Review

> Rereview against live source. Supersedes the 2026-07-13 review, which predated the stroke tessellation kernel, copy/clone functions, and the broad consumer expansion the package now demonstrates.

## Verdict

`solid -- 89/100`. A mature vector-path geometry kernel with 54 exported functions across 28 source files, 28 colocated test files (1:1 coverage), and two properly typed dependencies (`@flighthq/types`, `@flighthq/math`). Since the prior review (90), the package added four new source files (`copyPath`, `tessellateStrokePath`, `explainStrokePathTessellation`, and the refactored shared `strokePathGeometry` kernel), fixed the `strokePath` object-literal issue, and broadened its consumer base to 13 SDK packages. The score drops by one because the four bugs and gaps flagged at 90 -- `dashPath` alias safety, mesh pool allocation, holes-aware tessellation, `getPathLastPoint` post-CLOSE semantics -- remain open with no movement, and a new charter discrepancy appeared (the `@flighthq/math` dependency is undeclared in the charter). The package continues to grow scope without consolidating the documented defects; the next score increase requires closing at least the `dashPath` bug and the pool allocation gap.

## Present capabilities

- **Construction** (`path.ts`) -- `createPath` (winding default `nonZero`), verb appends (`appendPathMoveTo/LineTo/CurveTo/CubicCurveTo/Close`), primitives (`appendPathCircle/Ellipse` via KAPPA 4-cubic, `Rectangle`, `RoundRectangle` with scalar-or-per-corner radii clamped to half-edge, `Polygon/Polyline`), arcs (`appendPathArc` center-param; `appendPathArcTo` full SVG F.6 endpoint-to-center with radius scaling). No `ARC` verb leaks -- North star 2 holds. `getPathLastPoint` is O(1) (tail-of-data read).
- **Copy** (`copyPath.ts`) -- `copyPath` (alias-safe, tested: no-op when `out === source`), `clonePath` (allocating convenience wrapper). New since the prior review.
- **Conversion** -- `flattenPath` (adaptive de Casteljau, depth-capped, explicit CLOSE closure), `tessellatePath` (ear-clip per contour, coincident-point dedup, CCW normalization, guarded clip loop), `tessellatePathTyped` (typed-array output via copy), pool bracket (`acquirePathMesh(Typed)/releasePathMesh(Typed)`, high-water 64).
- **Stroke tessellation kernel** (`strokePathGeometry.ts`) -- Shared `buildStrokePathGeometry` consumed by both `strokePath` (outline emission) and `tessellateStrokePath` (direct non-overlapping triangles). Curves flatten once, dashes split once, and both consumers see the same offset/join/cap samples. Numeric issue codes (`StrokePathTessellationIssue*`) carry no diagnostic prose into core bundles. New since the prior review.
- **Stroke outline** (`strokePath.ts`) -- Miter/round/bevel joins with miter-limit fallback, butt/round/square caps, dashing; uses `createPath('nonZero')` (the prior review's object-literal issue is resolved). `StrokeStyle` lives in `@flighthq/types` (charter decision 3 satisfied).
- **Direct stroke mesh** (`tessellateStrokePath.ts`) -- Builds a non-overlapping triangle mesh directly from stroke cross-sections, avoiding the strokePath-then-tessellatePath round trip. Returns `null` for pathological centerlines, enabling renderer fallback. New since the prior review.
- **Measurement / analysis** -- `getPathLength`, `getPathContourLengths`, `getPathPointAtDistance/getPathTangentAtDistance/getPathPositionAtDistance` (clamped, single flatten pass), `getPathNearestPoint` (closest point, returns distance, `-1` sentinel), `getPathSignedArea` + `getPathContourOrientation` (shoelace), `getPathBounds` (true bezier extrema via B'(t)=0), `containsPathPoint` (nonZero/evenOdd winding test with curve subdivision), segment evaluators (`getPathSegmentPointAtParameter/...Tangent...`, standalone `getCubic/QuadraticBezierPoint/Tangent`).
- **Transformation / editing** -- `transformPath/translatePath` (alias-safe, tested), `reversePath` (control re-pairing, built on `forEachPathSegment`, aliased-case tested), `dashPath` (standalone dash split), `decimatePath` (Douglas-Peucker), `cleanPath` (vertex dedup with closed-seam wrap, aliased-case tested), `fitPathCurves` (Schneider least-squares with Newton-Raphson reparameterization).
- **Path morphing** (`pathMorph.ts`, `pathMorphGeometry.ts`) -- `createPathMorph` (topology-compatible endpoints prepared into canonical cubic stream via exact cubic subdivision), `samplePathMorph` (allocation-free after first call). Closed-contour orientation normalization via exact cubic signed-area integral; even-odd contours normalize independently, non-zero paths reject mixed orientation.
- **Diagnostics** -- `explainPathMorphCreation` and `explainStrokePathTessellation` are pure diagnostic twins in separately importable modules, matching the diagnostics convention (no reason strings in the production path).
- **Visitor** -- `forEachPathSegment`, the canonical decode normalizing WIDE_* verbs. Used internally by `reversePath` and `pathMorphGeometry`.
- **Siblings honored** -- Every op is kernel-free per the 2026-07-09 kernel-dependency decision; `offsetPath/simplifyPath/booleans` correctly live in `@flighthq/path-boolean`, SVG `d` codec in `@flighthq/path-formats`.

## Gaps

Vs. a textbook path library (Skia/Cairo/paper.js), excluding codec/boolean gaps that belong to the siblings:

- **`dashPath` alias bug (unfixed since 2026-07-13).** Doc comment says "Alias-safe", but `dashPath.ts` lines 18-19 clear `out.commands` and `out.data` before `flattenPath(source)` at line 28 -- so `dashPath(p, dash, 0, p)` empties the source before flattening. `decimatePath/cleanPath/fitPathCurves` all flatten first (correct order). No aliased-case test exists for `dashPath`, `decimatePath`, `fitPathCurves`, or `reversePath` (which has an alias test for `transformPath`-style output but not one that exercises `reversePath(p, p)`). `cleanPath` and `copyPath` both have aliased-case tests.
- **The mesh pool does not remove allocation (unfixed since 2026-07-13).** `acquirePathMesh` calls `tessellatePath` (which allocates fresh `number[]`s) then copies element-by-element into the pooled mesh; `acquirePathMeshTyped` pools only the wrapper and reassigns both typed arrays (the source comment on line 33 admits it). The missing primitive is an out-param tessellate writing into an existing `PathMesh`; without it the pool's stated purpose -- no per-frame heap allocation -- is not met.
- **Holes-aware tessellation (unbuilt since charter decision 2026-07-02).** `tessellatePath` still fills each contour independently ("a hole contour fills solid", line 9 comment); the second, winding-honoring strategy blessed in the charter ("Multiple tessellation strategies coexist") does not exist. Self-intersecting contours still bail (`if (!clipped) break`).
- **`getPathLastPoint` post-CLOSE semantics (unfixed since 2026-08-08).** The O(1) tail read at `path.ts` line 329-332 returns the last anchor before CLOSE, but the SVG pen position after CLOSE is the subpath start -- so `appendPathArcTo` after a closed contour continues from the wrong point.
- **Decode duplication (unfixed since 2026-07-13).** `flattenCubic/flattenQuadratic/distanceToChordSq` in `flattenPath.ts` are structurally duplicated by `flattenCubicWindingNumber/flattenQuadraticWindingNumber/chordDistSq` in `containsPathPoint.ts` (same de Casteljau subdivision, same chord-distance test). `strokePathGeometry.ts` maintains a private `applyDash` (line 367) operating on flattened subpaths in parallel to the public `dashPath`. `contourLength` is identically implemented in both `getPathLength.ts` (line 18) and `getPathContourLengths.ts` (line 16). Only `reversePath` and `pathMorphGeometry` consume `forEachPathSegment`.
- **Measure-family absences.** No curvature query, no sub-range extraction (`splitPathAtDistance/getPathSegmentRange` -- the primitive behind Lottie trim-paths and text-on-path), and no cached `PathMeasure` (charter open direction 1): every distance query re-flattens.
- **Stroke completeness.** Dash phase resets at every subpath -- `strokePathGeometry.ts` line 90 passes the same `dashOffset` into each subpath rather than accumulating across them (SVG/Skia continue globally; charter open direction 2). Alignment is center-only: `StrokeStyle` has no `alignment` field. No hairline (sub-pixel) codepath.
- **`package.json` description is stale.** "Vector path geometry: curve flattening and tessellation of GraphicsPath outlines" names a dead type (`GraphicsPath`) and predates the construction, measurement, editing, morphing, and stroke tessellation surfaces. Charter open direction 3 already flags this; it remains unfixed.
- **`@flighthq/math` dependency not reflected in charter.** `path.ts` imports `CIRCLE_KAPPA` from `@flighthq/math/contract`. The charter says "Dependencies: `@flighthq/types` only." The dependency is real and narrowly scoped (one constant), but the charter text is now stale.

## Charter contradictions

**One minor discrepancy.** The charter states "Dependencies: `@flighthq/types` only" but `package.json` declares `@flighthq/math` as a dependency, and `path.ts` line 1 imports `CIRCLE_KAPPA` from `@flighthq/math/contract`. The dependency is narrowly scoped (a single constant for ellipse/circle/rounded-rect arc approximation) and does not violate the value-typed leaf boundary, but the charter text should be updated. All other charter decisions and boundaries are cleanly realized: the kernel-dependency line holds, `decimatePath/cleanPath` naming matches the 2026-07-09 decision, the removed naive `offsetPath` stays gone, `StrokeStyle` is in `@flighthq/types`, and the closed `PathCommand` union remains the blessed bedrock exception.

## Contract & docs fit

**(a) Package vs. contract -- strong.** Types are header-first in `@flighthq/types` (`Path`, `PathCommand`, `PathSegment`, `PathMesh`, `PathMeshTyped`, `StrokeStyle`, `PathMorph`, `PathMorphCreationExplanation`, `PathMorphCreationReason`, `StrokePathTessellationExplanation`, `StrokePathTessellationReason`). Full unabbreviated `Path` in every export name. Out-params use locals-first alias safety (except the `dashPath` bug above). Sentinels not throws (`false`, `-1`, `'degenerate'`, `null`). Two export lanes (`.` and `./contract`). `sideEffects: false`. One test file per source file (28/28), describes mirroring exports. Diagnostic explain functions are separately importable so production bundles carry no reason strings.

**(b) Docs stale -- three candidate revisions (all pre-existing):**

1. **`package.json` description** -- still "curve flattening and tessellation of GraphicsPath outlines" (see Gaps above).
2. **Charter dependency claim** -- "Dependencies: `@flighthq/types` only" is now inaccurate (see Charter contradictions above).
3. **Charter consumer list** may be understated. The charter names clip, shape, and interaction as primary in-SDK consumers. Actual value-import consumers are: clip, font, interaction, motionpath, path-boolean, path-formats, scene2d-formats, scene2d-gl, scene2d-wgpu, shape, skeleton2d, swf, and timeline (13 packages). The prior review's claim that "shape and interaction no longer import @flighthq/path" is itself incorrect: `shape/compactStrokePath.ts` imports `appendPathClose`, `shape/morphShape.ts` imports `createPath` and `samplePathMorph`, and `interaction/displayHitTests.ts` imports `containsPathPoint`.

## Candidate open directions

1. **Sub-range extraction / trim paths** (`splitPathAtDistance`, `getPathSegmentRange`). Kernel-free, measure-family, and the primitive Lottie trim-path animation requires. `scene2d-formats/lottieDocument.ts` already imports from this package; the missing function would close the gap without a new cross-package dependency.
2. **Out-param tessellation seam** -- an out-writing tessellate is the prerequisite for the pool to deliver its stated zero-allocation purpose, and serves the Rust/Wasm zero-copy story (North star 1). Confirming it as the intended internal shape would unblock the pool fix and the holes-aware strategy.
3. **Curvature query** (`getPathCurvatureAtDistance`, plus per-segment curvature at t). Canonical measure-family function (Skia/paper.js); additive, out-param/scalar-return, reuses the existing flatten walk.
4. **Internal dedup module** -- a shared flatten/chord-distance module consumed by `flattenPath`, `containsPathPoint`, and `strokePathGeometry` would eliminate the current triple implementation, and a shared `contourLength` would close the minor `getPathLength`/`getPathContourLengths` duplication.
5. Existing charter open directions 1 (PathMeasure), 2 (dash phase/alignment), 3 (description), 4 (Rust crate) all remain live.
