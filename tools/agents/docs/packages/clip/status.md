---
package: '@flighthq/clip'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# clip — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/clip

**Session dates**: 2026-06-24 (pass 1), 2026-06-24 (pass 2) **Starting score (pass 2)**: 78/100 **Estimated new score**: 90/100 (Gold)

## Implemented APIs

All Bronze, Silver, and achievable Gold items are now implemented in `packages/clip/src/clipRegion.ts`.

### Bronze (all implemented — pass 1)

- `intersectClipRegions(out, a, b)` — alias-safe; rect∩rect = scissor-eligible fast path; mixed/contour forms are conservative (bounds intersection + finer contours kept). Disjoint inputs produce an empty region.
- `getClipRegionBounds(out, clip)` — copies `clip.rect` into an out rectangle.
- `isClipRegionEmpty(clip)` — true when bounding rect is empty or contour array is non-null but zero-length.
- `isClipRegionRectangular(clip)` — named predicate for the `contours === null` discriminator.
- `cloneClipRegion(clip)` — allocating deep copy; version preserved from source.
- `copyClipRegion(out, source)` — in-place retarget; no-op when `out === source`; bumps version.

### Silver (all implemented — pass 1)

- `transformClipRegion(out, clip, matrix)` — axis-aligned matrices keep the rect form (scissor-eligible); rotation/skew promotes the rectangle to a 4-point quad contour (scissor-eligibility invariant preserved). Contour form transforms every point. Alias-safe.
- `clipRegionContainsPoint(clip, x, y)` — rect form via `containsRectanglePointXY`; contour form via a winding-number ray-cast that handles both `nonZero` and `evenOdd`.
- `clipRegionIntersectsRectangle(clip, rectangle)` — rect fast path via `intersectsRectangle`; contour form uses bounds (conservative).
- `clipRegionContainsRectangle(clip, rectangle)` — rect fast path via `enclosesRectangle`; contour form uses bounds (conservative).
- `createClipRegionFromContours(contours, winding)` — raw flattened-contour constructor; bounding rect computed from data.
- `setClipRegionToRectangle(out, rectangle)` — in-place retarget to rect form; bumps version.
- `createClipRegionFromRoundedRectangle(rectangle, radius, tolerance)` — internally builds a cubic Bezier path and flattens; falls back to plain rect when `radius <= 0`.
- `createClipRegionFromEllipse(rectangle, tolerance)` — cubic Bezier approximation (kappa).
- `createClipRegionFromCircle(x, y, radius, tolerance)` — cubic Bezier approximation.
- `clipRegionsEqual(a, b)` — structural comparison (form, winding, rect, contour point-by-point).
- `unionClipRegions(out, a, b)` — bounding-box union; rect∩rect stays scissor-eligible; mixed forms keep contours from the richer input.

### Gold (implemented — pass 2)

- `normalizeClipRegion(out, clip)` — lightweight canonicalization: detects a single-contour 4-point (8 coordinate) axis-aligned rectangle and promotes it back to the scissor-eligible rect form. Computes bounding box of the 4 points, then checks that each point is within `NORMALIZE_EPSILON` of a corner of the bounding box. When normalized, sets rect form; when not detectable, copies through unchanged. Bumps `out.version` in all cases. Does not require a full polygon-clipping kernel. Correctly handles quads produced by `transformClipRegion` with 90-degree rotations (these are axis-aligned, so they normalize).
- `acquireClipRegion()` — pool acquire; returns an empty rectangular region at the origin, resetting all fields to defaults. Allocates if pool is empty.
- `releaseClipRegion(clip)` — pool release; returns `clip` to the pool. Caller must not use the region after release.

### Internal helpers (not exported)

- `pointInContours(contours, winding, px, py)` — winding-number ray-cast for point-in-polygon.
- `appendCircleToPath`, `appendEllipseToPath`, `appendRoundedRectToPath` — cubic Bezier shape builders.
- `setRectangleToContoursBounds` — bounds computation from raw contours.
- `makeEmptyClipRegion` — pool helper, allocates a blank region.
- `clipRegionPool` — module-level pool array (at bottom of file per source style).
- `NORMALIZE_EPSILON` — tolerance constant for `normalizeClipRegion` (1e-6).
- `KAPPA` — kappa constant for Bezier curve approximation of circles/ellipses.

### Parameter type widened (pass 1)

`createClipRegionFromRectangle` accepts `Readonly<RectangleLike>` instead of `Readonly<Rectangle>`, consistent with convenience fallback paths.

### Package Map entry added (pass 2)

`@flighthq/clip` entry added to `tools/agents/docs/index.md` Package Map between `@flighthq/filters-gl` (which describes per-backend GPU leaf shaders) and `@flighthq/filters`, listing constructors, composition, queries, transform, utilities, and pool bracket.

### Tests

54 tests in `clipRegion.test.ts` cover every exported function, including:

- Pool acquire/release lifecycle: pool reuse, field reset on reuse, identity preservation.
- Alias-safe cases for `intersectClipRegions`, `copyClipRegion`, `transformClipRegion`.
- Both rect and contour code paths for all query functions.
- Disjoint-intersection edge case.
- Winding rule preservation in `cloneClipRegion` and `createClipRegionFromPath`.
- Rotation promotion in `transformClipRegion`.
- `radius <= 0` fallback in `createClipRegionFromRoundedRectangle`.
- `normalizeClipRegion`: rect passthrough, axis-aligned quad → rect promotion, non-rectangular contour passthrough, multi-contour passthrough, 90-degree-rotated quad normalization.

## Deferred items and why

### Gold: true contour boolean algebra (subtractClipRegions, xorClipRegions, exact intersect/union)

Requires a polygon-clipping kernel (Vatti/Weiler-Atherton or Martinez-Rueda). The kernel almost certainly belongs in `@flighthq/path` (or a `@flighthq/path-boolean` neighbor), not duplicated in `clip`. `@flighthq/path` currently has `flattenPath` and `tessellatePath` only — no boolean kernel exists anywhere. This is genuinely new geometry work. **Requires a cross-package design decision — surface to user before starting.**

### Gold: Float32Array typed-array contour storage

Current contours are `number[][]`. The roadmap calls for `Float32Array` flat storage for cheaper transform and GPU upload. This is a breaking change to the `ClipRegion` interface in `@flighthq/types` (from `number[][] | null` to `Float32Array | null`), requiring coordination with every backend clip module. **Surface before starting; breaking types-layer change.**

### Gold: Rust flighthq-clip crate

Does not exist. Creating it is a separate Rust-worktree task, naturally sequenced after TS API stabilizes. As a value-typed leaf, `clip` is in the mixable set — a strong early Rust↔TS conformance target.

### Gold: winding normalization helpers

`getClipRegionWinding` / explicit winding constructors and even-odd↔non-zero conversion. Today winding correctness lives entirely in backends. Deferred pending a decision on where normalization ownership belongs.

### Gold: functional test

A scene that exercises `intersectClipRegions` with nested clipping across Canvas/DOM/WebGL backends to verify the descriptor's bounds match what each renderer clips to. Deferred; needs the `functional-test` skill and a visual scene.

## Design choices made

### normalizeClipRegion implementation strategy

The lightweight approach (4-point axis-aligned check without a boolean kernel) was chosen because:

1. The primary real-world case that benefits from normalization is a rectangle that was promoted to a quad contour by `transformClipRegion` with a rotation that happens to be an axis-aligned multiple (90°, 180°, 270°). These quads all have exactly 4 points at corners of their bounding box.
2. The full polygon-clipping kernel needed for general contour normalization is a cross-package design decision (belongs in `@flighthq/path` or a `@flighthq/path-boolean` neighbor).
3. The lightweight check is O(n) in the 8 coordinates (constant time), allocation-free, and covers the most valuable case with no kernel dependency.

The check algorithm: compute the bounding box of all 4 points; then for each point, verify it is within `NORMALIZE_EPSILON` of either `minX` or `maxX` (x-axis), and within `NORMALIZE_EPSILON` of either `minY` or `maxY` (y-axis). If all 4 points pass, the contour is an axis-aligned rectangle.

Note: a 90-degree-rotated square produces a diamond (not axis-aligned), so `normalizeClipRegion` correctly preserves it. But a 90-degree-rotated rectangle with width ≠ height produces a new axis-aligned rectangle (rotated 90°), which `normalizeClipRegion` correctly normalizes.

### Pool design

`acquireClipRegion`/`releaseClipRegion` use a simple module-level `ClipRegion[]` array. Reset on acquire (not on release) follows the pattern of other Flight pools: the pool holds "dirty" objects that are cleaned when re-issued. No maximum pool size — consistent with other Flight pools.

### Source style

Per Flight conventions, module-level pools, constants, and scratch objects are at the bottom of the file. The exported functions section begins immediately after the imports. The pool helper `makeEmptyClipRegion` is also at the bottom, called only by `acquireClipRegion`.

## Concerns and known conservative behaviors

- `intersectClipRegions` for contour∩contour is conservative (keeps finer contours, uses bounds intersection). True intersection requires the Gold boolean kernel.
- `unionClipRegions` for two contour regions keeps the "larger" input's contours by count (heuristic). Not a geometric union.
- `clipRegionContainsRectangle` for contour form falls back to bounding-box containment (conservative). False positives are possible for concave contours.
- `normalizeClipRegion` only detects single-contour 4-point quads. Multi-contour sets that happen to be rectangular are not normalized; they would require the full polygon kernel.

## Suggestions for future sessions

1. **Path boolean kernel** — open a dedicated initiative: add boolean ops (`intersectPaths`, `subtractPaths`, `xorPaths`) to `@flighthq/path` or a `@flighthq/path-boolean` neighbor, then compose `clip`'s Gold exact algebra over it.
2. **Rust `flighthq-clip` crate** — port the now-stable TS surface. Start with value-typed constructors and queries (no GPU, deterministic, headlessly fingerprint-able); boolean kernel follows after the path-boolean decision.
3. **Functional test** — scene exercising `intersectClipRegions` with nested clipping across Canvas/DOM/WebGL backends.
4. **Float32Array contour migration** — coordinate with render backend owners before starting.
