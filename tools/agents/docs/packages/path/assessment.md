---
package: '@flighthq/path'
updated: 2026-06-24
basedOn: ./review.md
---

# path — Assessment

> Recommendation layer. Sorts the gaps in `review.md` and the (now-absorbed) maturation roadmap into sweep-safe `Recommended` vs. parked `Backlog`. `Approved` is empty — approval is the user's verbal gate. Design forks and cross-package items are routed to the charter's Open directions, not into `Recommended`.
>
> **Absorbs** `reviews/maturation/depth/path.md` (the Bronze/Silver/Gold roadmap). Nearly the entire Bronze and Silver tier has since **landed** (close/copy/clone/transform/bounds/primitives/segment iteration/typed-array output/stroking/measurement/hit-testing/arcs/reverse/polygon/curve-eval — all verified present in the review). Only the Gold tier and a few internal refinements remain; the roadmap is spent and may be removed.

## Recommended

Sweep-safe: within `@flighthq/path`, no cross-package coupling, no breaking change, no open design decision. A blanket "do all recommended" can safely bless this set.

1. **Cache the pen position so `getPathLastPoint` is O(1).** `appendPathArcTo` rescans the whole command stream on each call to find the current pen position — quadratic for arc-heavy programmatic building. Track the last point on the runtime/build state instead of re-deriving it. Pure internal perf fix; no API or output change. — review.md#gaps (`getPathLastPoint is O(n)`)

2. **Route the internal command walkers through `forEachPathSegment`.** The verb/stride decode is re-implemented across ~8 files (`getPathBounds`, `transformPath`, `containsPathPoint`, `strokePath`'s decode, `walkPathSegment`, `getPathLastPoint`, flatten). `forEachPathSegment` was introduced partly to centralize this but most internal walkers do not use it. Collapsing the duplicate decoders is an internal refactor with no API change. (Keep the tight stride-walk loops where fork B's closed-union exception applies; this is about removing _duplication_, not changing dispatch.) — review.md#structural-forks-fit

3. **Expose `dashPath` independently of `strokePath`.** The dash-pattern split already exists inside `strokePath`; surfacing it as a standalone function (polyline/path → dashed sub-paths) is purely additive — no decision, no new dependency. — review.md#gaps (`Path editing/simplification`)

4. **Add `getPathContourLengths`.** Per-contour arc lengths over the existing flatten pass. Additive measurement function; reuses the cumulative-length machinery already present for `getPathLength`. — review.md#gaps (`Full PathMeasure surface`)

5. **Add `getPathNearestPoint` (closest-point-on-path).** Additive pure query over flattened segments, out-param into `Vector2Like`, consistent with the existing `*AtDistance` family. No design fork — it is one more analytic function on the current pure-re-flatten model. — review.md#gaps (`Full PathMeasure surface`)

6. **Add `simplifyPath` (Douglas–Peucker decimation).** Flattened-contour decimation to a tolerance, out-param `Path`, alias-safe. Self-contained, dependency-free, within-package. — review.md#gaps (`Path editing/simplification`)

7. **Add `fitPathCurves` (Schneider polyline → bezier fitting).** Re-curves a flattened/scanned outline. Additive, within-package; larger than items 4–6 but carries no design decision and no cross-package coupling. — review.md#gaps (`Path editing/simplification`)

## Backlog

Parked: cross-package coordination, larger scope, or waiting on an Open direction. Reason given per item. The first seven also feed the charter's **Open directions** (noted for the charter; not edited here).

- **Boolean / path-overlay ops** (`unionPaths`/`intersectPaths`/`differencePaths`/`xorPaths`). The single largest capability gap, but a **design fork**: the review and roadmap both lean toward a `@flighthq/path-boolean` neighbor package (keeps Vatti/Martínez-Rueda weight off the geometry core). New-package + bedrock-test decision → Open direction, not a sweep. — review.md#candidate-open-directions (1)

- **SVG path-string parse / serialize** (`parseSvgPathData`/`serializeSvgPathData`). Arc math is already present; only the string codec is missing. But the _home_ is a design fork — a `@flighthq/path-formats` triad cell (passes the plurality guard only if a second textual path format is foreseen), in-package, or owned by a future `svg` importer. → Open direction. — review.md#candidate-open-directions (2)

- **Holes-aware / robust triangulation** in `tessellatePath`. Cross-package contract question with the `render-*` owners (does the direct-fill route grow earcut hole-stitching + winding honoring, or do holes stay the renderer's stencil-then-cover job?). Not sweep-safe. — review.md#candidate-open-directions (3)

- **Self-intersection robustness in tessellate** (constrained-Delaunay / monotone fallback replacing the `if (!clipped) break` bail). Research-grade and changes `tessellatePath` behavior/output — larger scope than a sweep, and entangled with the holes-aware decision above. — review.md#gaps (`Self-intersection robustness`)

- **`PathMeasure` shape** — a stateful cached measure entity vs. the current pure re-flattening functions. A design decision (affects amortization for text-on-path / length-driven animation) that governs whether items 4–5 above stay free functions or fold into an entity. → Open direction. — review.md#candidate-open-directions (4)

- **Promote `StrokeStyle` to `@flighthq/types`.** Currently defined inline in `strokePath.ts`. As a pure input descriptor a renderer or higher layer may also author, it belongs in the header layer — but it crosses a package boundary, so it is coordination, not a sweep. → Open direction. — review.md#contract--docs-fit (a) / candidate-open-directions (5)

- **Stroke semantics** — global dash-phase continuity across subpaths (SVG/Skia/PDF) and inner/outer stroke alignment vs. blessing the current per-subpath, center-only behavior. The tests _pin_ the current behavior, so changing it is a deliberate decision, not a sweep. → Open direction. — review.md#candidate-open-directions (6)

- **Rust parity for `flighthq-path`.** The Bronze/Silver/Gold additions are not yet mirrored in the crate. A prime first conformance target (value-typed leaf, deterministic, headlessly fingerprint-able), but it is cross-worktree coordination, not within-package TS work. — review.md#gaps (`Rust parity`)

- **Add a `@flighthq/path` entry to the codebase-map Package Map.** The live map lists `clip` and `math` but not `path`, despite `types`/`Path.ts` referencing it and `clip` consuming `Path`. A docs/admin fix outside the package source — surfaced for the map maintainer, not a code sweep. — review.md#contract--docs-fit (b.1)

- **Author the charter's North star / Boundaries.** `lastDirection: null`; a one-paragraph Boundaries statement (what is explicitly _not_ path's job — rendering, GPU-upload orchestration, the SVG DOM) would settle the boolean-ops / formats / `PathMeasure` / stroke-semantics forks by precedent. Charter authoring is the user's gate, not an assessment action. — review.md#contract--docs-fit (b.2) / candidate-open-directions (7)

## Approved

_Frozen on the user's verbal approval only. None yet._
