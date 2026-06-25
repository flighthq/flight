# @flighthq/path — status

## 2026-06-25 — builder R2-4 lost-source recovery

Recovered lost source for `@flighthq/path` by merging gitignored `dist/*.js` (impl + verbatim comments) with `dist/*.d.ts` (types), per the validated camera pattern. Verification gate `npm run test --workspace=packages/path`: **126 tests across 13 files, all passing.**

### Recovered modules (new src files + colocated tests)

- `containsPathPoint.ts` — `containsPathPoint` (even-odd / non-zero point-in-path via ray-cast winding number, adaptive curve flattening).
- `copyPath.ts` — `clonePath`, `copyPath` (deep copy / alias-safe out-param copy).
- `getPathBounds.ts` — `getPathBounds` (AABB with true cubic/quadratic bezier extrema, out-param).
- `getPathLength.ts` — `getPathLength` (summed arc length over flattened contours).
- `getPathPointAtDistance.ts` — `getPathPointAtDistance`, `getPathPositionAtDistance`, `getPathTangentAtDistance` (arc-length sampling of point + unit tangent).
- `getPathSegmentAtParameter.ts` — `getCubicBezierPoint`, `getCubicBezierTangent`, `getPathSegmentPointAtParameter`, `getPathSegmentTangentAtParameter`, `getQuadraticBezierPoint`, `getQuadraticBezierTangent` (per-segment parametric evaluation + bezier primitives).
- `getPathSignedArea.ts` — `getPathContourOrientation`, `getPathSignedArea` (shoelace signed area / orientation).
- `reversePath.ts` — `reversePath` (per-subpath winding reversal, alias-safe, control-point repairing).
- `strokePath.ts` — `strokePath` + `StrokeStyle` (centerline → fillable outline: joins miter/round/ bevel, caps butt/round/square, dashing with offset).
- `transformPath.ts` — `transformPath`, `translatePath` (affine transform of all anchors/controls, alias-safe).

### Recovered functions added into EXISTING src files

- `path.ts` — restored the pruned-out builders: `appendPathArc`, `appendPathArcTo`, `appendPathCircle`, `appendPathClose`, `appendPathEllipse`, `appendPathPolygon`, `appendPathPolyline`, `appendPathRectangle`, `appendPathRoundRectangle` (SVG/kappa arc math, rounded-rect corner-radius clamping). `path.test.ts` extended to mirror.
- `flattenPath.ts` — restored the pruned-out `CLOSE`-verb handling (appends the contour start point, tracks `contourStart`, resets the contour). Two `CLOSE` tests added to `flattenPath.test.ts`.

`index.ts` updated with `export *` for every recovered standalone module, kept alphabetized.

### Fossils skipped

None. Every dist module is genuine geometry/path functionality; nothing implements a deliberately-dropped concept.

### Parked

- `forEachPathSegment` — needs type `PathSegment` in `@flighthq/types` (no `PathSegment.ts`, not exported anywhere in `packages/types/src/`). The dist module decodes the command/data stream into `PathSegment` visitor values.
- `tessellatePathTyped` — needs type `PathMeshTyped` in `@flighthq/types` (no `PathMeshTyped.ts`, not exported). Produces `Float32Array`/`Uint32Array` GPU-upload meshes.
- `pathMeshPool` (`acquirePathMesh`, `acquirePathMeshTyped`, `releasePathMesh`, `releasePathMeshTyped`) — needs type `PathMeshTyped` in `@flighthq/types` (same gap) and depends on the parked `tessellatePathTyped`.

### Cross-package gap surfaced (not edited — out of bounds)

`@flighthq/types` `PathCommand` (in `Path.ts`) is currently missing the `CLOSE` member that the recovered path code uses (`PathCommand.CLOSE`). The type/value `PathCommand` IS present and importable (the boundary check is filename = type name, and `Path.ts` exists), so the modules were recovered. At runtime `PathCommand.CLOSE` resolves to `undefined`, and the close logic is internally consistent against that — matching exactly how the original `dist/*.js` shipped (the types build `dist/Path.js` also lacks `CLOSE`). All 126 vitest tests pass on this basis. A workspace `tsc`, however, reports `Property 'CLOSE' does not exist on PathCommand` for the close-using modules. This is a `@flighthq/types` prune artifact (the `CLOSE: 7` enum member was removed from `Path.ts`), to be restored under the separate types review — it was intentionally NOT edited here per the hard boundary. Restoring `CLOSE` to `@flighthq/types` clears the typecheck for all recovered modules.

## 2026-06-25 — builder R2-4 second-pass recovery

The three modules parked in the first pass for missing `@flighthq/types` types are now recoverable — the parallel types-recovery pass restored `PathSegment`, `PathMesh`/`PathMeshTyped`, and the `PathCommand.CLOSE` member. All three are recovered this pass.

### Recovered

- `forEachPathSegment.ts` (+ test) — decodes the command/data stream into `PathSegment` visitor values; normalizes `WIDE_MOVE_TO`/`WIDE_LINE_TO` to moveTo/lineTo, skips NO_OP. Needed `PathSegment` (now present in `@flighthq/types`).
- `tessellatePathTyped.ts` (+ test) — `Float32Array`/`Uint32Array` GPU-upload mesh over `tessellatePath`. Needed `PathMeshTyped` (now present).
- `pathMeshPool.ts` (+ test) — `acquirePathMesh`/`acquirePathMeshTyped`/`releasePathMesh`/`releasePathMeshTyped` pool brackets with a `POOL_HIGH_WATER = 64` high-water mark. Needed `PathMesh`/`PathMeshTyped` (now present) and the recovered `tessellatePathTyped`.

`index.ts` updated with `export *` for `forEachPathSegment`, `pathMeshPool`, and `tessellatePathTyped`, kept alphabetized.

No functions were missing from existing src files (dist/src export sets already matched for every shared module).

### Skipped fossil

None. All remaining dist modules are genuine path/geometry functionality.

### Parked

None. Every previously-parked module was recovered.

### Test result

`npm run test --workspace=packages/path` — 16 files, 144 tests, all passing.
