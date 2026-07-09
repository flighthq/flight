---
package: '@flighthq/path'
updated: 2026-07-02
basedOn: ./review.md
---

# path — Assessment

Sorted from the depth review (88/100), the builder's landed expansion (42 exports, 144 tests — verified present), and the direction session (2026-07-02). Five decisions blessed. The package is already strong — a mature value-typed geometry kernel with construction, flattening, tessellation, measurement, analysis, transformation, stroking, and hit-testing. The sweep items are internal quality (O(1) pen cache, deduplicated walkers) plus additive measurement/editing functions that are canonical for a mature path library.

## Recommended

Sweep-safe: within `@flighthq/path`, no cross-package coupling, no breaking change, no open design decision.

1. **Cache the pen position so `getPathLastPoint` is O(1).** `appendPathArcTo` rescans the whole command stream on each call to find the current pen position — quadratic for arc-heavy programmatic building. Track the last point on the runtime/build state instead of re-deriving it. Pure internal perf fix; no API or output change.

2. **Route the internal command walkers through `forEachPathSegment`.** The verb/stride decode is re-implemented across ~8 files. Collapsing the duplicate decoders is an internal refactor with no API change. Keep tight stride-walk loops where fork B's closed-union exception applies; this is about removing _duplication_, not changing dispatch.

3. **Expose `dashPath` independently of `strokePath`.** The dash-pattern split already exists inside `strokePath`; surfacing it as a standalone function (polyline/path → dashed sub-paths) is purely additive.

4. **Add `getPathContourLengths`.** Per-contour arc lengths over the existing flatten pass. Additive measurement function; reuses the cumulative-length machinery already present for `getPathLength`.

5. **Add `getPathNearestPoint` (closest-point-on-path).** Additive pure query over flattened segments, out-param into `Vector2Like`, consistent with the existing `*AtDistance` family.

6. ~~**Add `simplifyPath` (Douglas-Peucker decimation).**~~ **Done** — ships as `decimatePath` (renamed 2026-07-09 so the CSG `simplifyPath` in `@flighthq/path-boolean`, which resolves self-intersections, owns the "simplify" verb). Flattened-contour decimation to a tolerance, out-param `Path`, alias-safe.

7. **Add `fitPathCurves` (Schneider polyline → bezier fitting).** Re-curves a flattened/scanned outline. Additive, within-package; larger than items 4–6 but carries no design decision and no cross-package coupling.

8. ~~**Add `offsetPath` (inset/outset by distance).**~~ **Done, reassigned** — a correct region offset needs the boolean kernel for self-intersection cleanup, so it landed in `@flighthq/path-boolean` as `offsetPath(path, delta, options)` (2026-07-09); the naive cleanup-free version formerly here was removed. Not a `path` item.

9. **Promote `StrokeStyle` to `@flighthq/types`.** Per Decision #3 in the charter — types should always live in types. Move the interface from `strokePath.ts` to the header layer. Cross-package coordination, but explicitly blessed as a decision.

## Backlog

Parked — each with the reason it is not sweep-safe.

- **Boolean / path-overlay ops** (`unionPaths`/`intersectPaths`/`differencePaths`/`xorPaths`). _Parked — new package._ Blessed (Decision #1): belongs in `@flighthq/path-boolean` neighbor. New-package creation + Vatti/Martínez-Rueda implementation.

- **SVG path-string parse / serialize** (`parseSvgPathData`/`serializeSvgPathData`). _Parked — new package._ Blessed (Decision #2): belongs in `@flighthq/path-formats`. Pure string parsing, no DOM.

- **Holes-aware tessellation.** _Parked — larger scope._ Blessed (Decision #5): a second function alongside the simple `tessellatePath`. Earcut + winding hole-stitching is a significant implementation, not a sweep item.

- **Self-intersection robustness in tessellate** (constrained-Delaunay / monotone fallback). Research-grade, changes `tessellatePath` behavior/output. Entangled with the holes-aware tessellation above.

- **PathMeasure shape.** _Parked — open direction._ Whether to add a stateful cached measure entity (amortized for text-on-path, animation) vs. keeping the current pure re-flattening functions. Open direction #1 in the charter.

- **Stroke dash-phase semantics.** _Parked — open direction._ Per-subpath (Flash) vs. global (SVG/Skia) vs. configurable. Inner/outer stroke alignment also unsettled. Open direction #2 in the charter.

- **Package description update.** The current description understates the package. Should reflect construction + conversion + measurement + analysis + transformation + stroking. Open direction #3 in the charter.

- **Codebase-map Package Map entry.** `path` is missing from the Package Map in `index.md` despite being a core dependency of `clip`, `shape`, and `interaction`. Docs/admin fix outside the package source.

- **Rust `flighthq-path` crate.** _Parked — cross-worktree._ Prime first conformance target (value-typed leaf, deterministic, headlessly fingerprint-able). Open direction #4 in the charter.

## Approved

- [2026-07-02 · picked] Sweep items 1–9: pen position cache, walker dedup, standalone dashPath, getPathContourLengths, getPathNearestPoint, simplifyPath, fitPathCurves, offsetPath, StrokeStyle promotion to types
