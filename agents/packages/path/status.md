---
package: '@flighthq/path'
updated: 2026-08-08
by: principal
---

# path — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item below was re-checked against `packages/path/src/` on 2026-08-08.

- **`dashPath` claims alias-safety it does not have.** The doc comment says "Alias-safe"
  (`dashPath.ts:10`) but the body clears `out.commands` / `out.data` (`:19-20`) *before* calling
  `flattenPath(source)` (`:28`), so `dashPath(p, dash, 0, p)` empties the path. `decimatePath`,
  `cleanPath`, and `fitPathCurves` flatten first (correct order); none of the four has an aliased-case
  test, which the testing convention requires of every `out`-parameter function.
- **The mesh pool does not remove allocation.** `acquirePathMesh` calls `tessellatePath`, which
  allocates fresh `number[]`s, then copies into the pooled mesh (`pathMeshPool.ts:19-26`);
  `acquirePathMeshTyped` pools only the wrapper and reallocates both typed arrays (`:35-38`, admitted in
  its own comment). The missing primitive is an `out`-writing tessellate.
- **Holes-aware tessellation is blessed but unbuilt.** `tessellatePath` fills each contour
  independently — "a hole contour fills solid" (`tessellatePath.ts:8`) — and self-intersecting contours
  still bail. The charter's second, winding-honoring strategy does not exist.
- **`getPathLastPoint` has wrong post-CLOSE semantics.** The O(1) tail read (`path.ts:328-332`) returns
  the last anchor *before* a CLOSE, but the SVG pen position after CLOSE is the subpath start, so
  `appendPathArcTo` following a closed contour continues from the wrong point.
- **Decode duplication persists.** Cubic/quadratic flattening is implemented twice — `flattenPath.ts:121`
  and `:157` versus the winding-number variants at `containsPathPoint.ts:158` and `:195` — and
  `strokePathGeometry.ts:367` keeps a private `applyDash` duplicating the public `dashPath`. Only
  `reversePath.ts` and `pathMorphGeometry.ts` consume `forEachPathSegment`.
- **Measure-family absences.** No curvature query, no sub-range extraction (`splitPathAtDistance` /
  `getPathSegmentRange` — the primitive behind Lottie trim-paths), and no cached `PathMeasure`: every
  distance query re-flattens. A repo-wide grep over `packages/` finds none of these names.
- **Stroke completeness.** Dash phase resets at every subpath — `strokePathGeometry.ts:90` passes the
  same `dashOffset` into each subpath rather than accumulating across them (SVG/Skia continue it).
  Alignment is center-only: `StrokeStyle` (`types/src/StrokeStyle.ts:1-8`) has no `alignment` field. No
  hairline (sub-pixel) codepath.
- **`package.json` description is stale** — "curve flattening and tessellation of GraphicsPath outlines"
  (`package.json:46`) names `GraphicsPath`, a type that no longer exists, and predates the whole
  editing/measurement surface.
- **There is no `crates/` directory in this repo.** The `crate: flighthq-path` stamp points at the
  separate flight-rs repo, not at work reachable from this tree.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. The 2026-06-24 deferral list checked out
  largely **false**: boolean ops and SVG `d` parsing were parked as untaken "new-package decisions" and
  both shipped as `@flighthq/path-boolean` and `@flighthq/path-formats`; curve fitting, contour lengths,
  and closest-point-on-path were parked as unbuilt and are now `fitPathCurves.ts`,
  `getPathContourLengths.ts`, and `getPathNearestPoint.ts`. `getPathLastPoint`'s "O(n) scan through the
  command stream on each call" is also false — it is an O(1) tail read (`path.ts:328`), though its
  post-CLOSE semantics remain wrong (above). `strokePath` builds through `createPath` (`strokePath.ts:13`),
  closing the object-literal nit.
- **2026-08-02** — Closed-contour morph correspondence detects authored traversal direction via an exact
  cubic signed-area integral; even-odd contours normalize independently, non-zero paths reject mixed
  orientation with `contour-orientation-mismatch`; exact progress endpoints copy prepared buffers.
- **2026-08-02** — `createPathMorph` / `samplePathMorph` / `explainPathMorphCreation` added
  (`pathMorph.ts`, `pathMorphGeometry.ts`): topology-compatible endpoints prepared into one canonical
  cubic stream, sampled into a reusable `Path` without replacing its buffers.
- **2026-07-13** — Review pass: the kernel-free scope holds, offset/simplify/boolean weight sits in the
  siblings, and `StrokeStyle` is homed in `@flighthq/types`.
- **2026-07-09** — `simplifyPath` renamed to `decimatePath`, ceding "simplify" to `@flighthq/path-boolean`;
  the naive `offsetPath` removed from this package.
- **2026-06-24** — Arc family (`appendPathArc`, `appendPathArcTo` per SVG §F.6), round-rectangle,
  segment-parameter evaluators, and the mesh pool bracket landed.
