---
package: '@flighthq/path'
updated: 2026-07-13
basedOn: ./review.md
---

# path — Assessment

Sorted from the 2026-07-13 rereview (solid — 90/100). The 2026-07-02 approved sweep is nearly complete: pen-position cache, standalone `dashPath`, `getPathContourLengths`, `getPathNearestPoint`, `decimatePath`, `fitPathCurves`, and the `StrokeStyle` promotion all landed, and `offsetPath` was correctly reassigned to `@flighthq/path-boolean`. What remains is one unlanded approved item (walker dedup), one real bug, and a pool that does not yet deliver its stated purpose.

## Recommended

Sweep-safe: within `@flighthq/path`, no cross-package coupling, no breaking change, no open design decision.

1. **Fix the `dashPath` alias bug.** It clears `out` before flattening `source`, so `dashPath(p, dash, offset, p)` empties the path despite the "Alias-safe" doc claim. Flatten first (the order `decimatePath`/`cleanPath`/`fitPathCurves` already use), and add aliased-case tests for `dashPath`, `decimatePath`, `fitPathCurves`, and `reversePath` per the testing convention (only `cleanPath` and `transformPath`/`translatePath` have them today).

2. **Land the approved walker/flatten dedup (carry-over of approved item #2).** `flattenQuadratic`/`flattenCubic`/chord-distance exist three times (`flattenPath`, `strokePath`, `containsPathPoint`) and the verb/stride decode ~6 times; `strokePath`'s private `applyDash` duplicates the dash walk `dashPath` now exports. One shared internal flatten/decode module (keeping tight loops where fork B's closed-union exception applies); `strokePath` composes `dashPath`'s walk.

3. **Out-param tessellation so the pool actually avoids allocation.** `acquirePathMesh` currently calls the allocating `tessellatePath` and copies; `acquirePathMeshTyped` pools only the wrapper object. Add an `out`-writing tessellate over an existing `PathMesh` (grow-only typed buffers for the typed variant) and rewire the pool through it. Internal seam; the public `tessellatePath` signature is untouched.

4. **Fix `getPathLastPoint` post-CLOSE pen semantics.** After CLOSE the SVG current point is the subpath start, not the last anchor; today `appendPathArcTo` continues from the wrong point after a closed contour. Behavior fix, no API change; test with an arc appended after `appendPathClose`.

5. **Add a curvature query** (`getPathCurvatureAtDistance`, plus per-segment curvature at t alongside the existing point/tangent evaluators). Canonical measure-family function (Skia/paper.js); additive, out-param/scalar-return, reuses the existing flatten walk.

6. **Update the `package.json` description.** "Curve flattening and tessellation of GraphicsPath outlines" names a dead type and understates the surface. Charter open direction #3 already gestures at this; the write itself is a sweep-safe chore: construction + conversion + measurement/analysis + transformation + editing + stroking.

7. **Replace `strokePath`'s result object literal with `createPath()`** — source-style conformance (constructors over literals for entity types). One-line, fold into item 2's touch of the file.

## Backlog

Parked — each with the reason it is not sweep-safe.

- **Holes-aware tessellation.** Blessed (charter Decision "Multiple tessellation strategies coexist") but a significant second tessellator (earcut hole-stitching + winding), not a sweep item. The largest remaining capability gap.
- **Self-intersection-robust triangulation.** Research-grade; entangled with the holes-aware work; changes `tessellatePath` failure behavior.
- **Sub-range extraction / trim paths** (`splitPathAtDistance`, extract-range). Kernel-free and in-scope, but new API surface whose shape should get a nod — and it feeds fork I's `lottie-formats` (trim-path animation), so sequencing is a user call. Surfaced as candidate open direction #1.
- **Path interpolation / morphing** (`interpolatePaths`). Home undecided (path vs. animation/tween binding layer). Candidate open direction #2.
- **PathMeasure entity.** Open direction #1 in the charter — stateful cached measure vs. pure re-flattening. Unchanged.
- **Stroke dash-phase semantics + alignment.** Open direction #2 — per-subpath vs. global (SVG/Skia) vs. configurable; inner/outer alignment. Unchanged.
- **Package Map + charter consumer-list staleness.** The map line and charter "What it is" say `shape`/`interaction` consume path; actual importers are clip, displayobject-gl/wgpu, motionpath, path-boolean, path-formats. Docs/admin edits outside the package cell — user's gate.
- **Rust `flighthq-path` crate.** Open direction #4; cross-worktree. Still the prime first conformance target.

## Approved

- [2026-07-02 · picked] Sweep items 1–9: pen position cache, walker dedup, standalone dashPath, getPathContourLengths, getPathNearestPoint, simplifyPath, fitPathCurves, offsetPath, StrokeStyle promotion to types
