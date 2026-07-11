---
package: '@flighthq/shape'
crate: flighthq-shape
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# shape — Charter

## What it is

`@flighthq/shape` is the **retained command recorder** for vector drawing — the retained-mode vector `Graphics`-style display node. It owns a flat command vocabulary (moveTo/lineTo/quadratic + cubic curves, arcs, primitives circle/ellipse/rectangle/round-rect/polygon/polyline, raw path injection, indexed `drawTriangles`), solid/gradient/bitmap fills and strokes, exact analytic local-bounds measurement, a solid-fill region resolver (`getShapeFillRegions`, with a raster-fallback sentinel), an opt-in per-command hit-test registry with built-in primitive handlers, a typed round-trip surface (planned: `getShapeGraphicsData` / `forEachShapeCommand` / `appendShapeGraphicsData`), and a data-only `Scale9Shape` entity carrying a `scale9Grid`.

Shape is the "what to draw" recorder, not the geometry kernel. General path tessellation, curve flattening, stroke-to-geometry expansion, and boolean operations belong to `@flighthq/path`. Rendering optimization is delegated to `displayobject-<backend>`. Format-specific serialization (SVG `<path d>`, Canvas2D replay, stable JSON) belongs in `@flighthq/shape-formats`.

## North star

1. **Retained command recorder over a closed, stable buffer format.** The command stream is a flat `[key, argCount, ...args]` buffer. New high-level primitives (arcs, polygons) decompose at append-time into the existing curve/line verbs, so the buffer format stays closed and every downstream pass (bounds/fill/hit-test) handles them for free. The string command keys are the round-trip and serialized form.
2. **Exact analytic measurement.** Bounds are computed from closed-form curve extrema (quadratic derivative root, cubic derivative-quadratic root), not by flattening — measurement is exact and allocation-explicit (`getShapeBounds` / `computeShapeLocalBoundsRectangle` write an `out` rectangle).
3. **Tessellation and stroke expansion are delegated.** Curve→line flattening, boolean ops, and stroke-outline geometry are `@flighthq/path` concerns. Shape depends on path for shared curve constants and flattening; it does not re-derive them per pass.
4. **Plain data, explicit allocation, sentinels.** Full unabbreviated names, `out`-param math, `null` sentinels for "fall back to raster" / "no handler", opt-in registration (`enableShapeHitTesting`), `sideEffects: false`, types-first in `@flighthq/types`.

## Boundaries

**In scope:**

- The `Shape` display node, its runtime quartet, and the full retained command vocabulary.
- Recording fills (solid/gradient/bitmap) and strokes (caps/joints/scaleMode captured as data).
- Exact local-bounds measurement (quadratic + cubic derivative solving, per-span stroke expansion, drawTriangles vertex sweep).
- Solid-fill region extraction (`getShapeFillRegions`) with winding-honored fill regions.
- Per-command hit-test registry with opt-in built-in handlers for primitives.
- Typed in-memory round-trip over the command buffer (readback + walk + replay).
- `Scale9Shape` data entity (the `scale9Grid` field). Whether shape also owns scale-9 _distortion_ is an Open direction.
- `drawTriangles` as a command in the vocabulary (a canonical `Graphics` command).

**Non-goals:**

- General path tessellation / boolean ops (→ `@flighthq/path`).
- Stroke-to-geometry expansion — converting a stroke centerline + style into a filled outline path (→ `@flighthq/path`).
- Rasterization of any fill or stroke (→ `displayobject-<backend>`).
- Quad/tile batch drawing — `drawQuads`/`drawTiles` (→ `@flighthq/sprite`).
- Format-specific serialization — SVG, Canvas2D replay, JSON (→ `@flighthq/shape-formats`).
- Shader fills — `beginShaderFill`/`lineShaderStyle` (cross-package, deferred).

## Decisions

- **[2026-07-02] Closed `switch(key)` in bounds/fill is the intentional tight-loop exception (fork B resolved).** `computeShapeLocalBoundsRectangle`, `getShapeFillRegions`, and `hasNonSolidShapeFill` dispatch over a closed `switch` on the command-key string. Hit testing uses an open registry. This asymmetry is intentional: the buffer format is closed (new primitives decompose into existing verbs on append), so the switch family is small, stable, and will not grow unboundedly. The hot-loop bounds/fill passes get direct dispatch; hit testing gets the registry because users may want custom per-command hit logic with different tolerances.

  **Why:** The buffer format is intentionally closed — arcs decompose to cubics, polygons to lines. The command family won't grow, so a registry adds indirection in a hot loop for no extensibility gain. Hit testing is the right exception because it's user-facing and per-command customizable.

- **[2026-07-02] Stroke geometry ownership: shape records style, path owns stroke-to-geometry expansion.** Shape records stroke style (`lineStyle`, caps, joints, miter) as data in the command buffer and uses half-thickness for bounds. Converting a stroke centerline into a filled outline path (caps, joints, miter geometry) is a `@flighthq/path` concern — `expandStrokeToPath` or similar. Hit-testing strokes composes both: shape asks path for the stroke outline, then does point-in-path.

  **Why:** Stroke expansion is "convert strokes into paths" — that's path's domain, composed out of path primitives. Shape is the recorder; path is the geometry kernel.

- **[2026-07-02] `@flighthq/shape-formats` neighbor approved.** SVG `<path d>` export, Canvas2D replay, and stable JSON serialization of the command stream belong in a `-formats` neighbor package. Same pattern as `textureatlas-formats`, `particles-formats`, `spritesheet-formats`. The JSON schema lives in `@flighthq/types` and round-trips with scene versioning.

  **Why:** Format-specific serialization is the exact use case the `-formats` neighbor pattern was designed for. SVG/Canvas2D/JSON are all domain-specific serialization of the same command stream.

- **[2026-07-02] Shape should depend on `@flighthq/path`.** The current package does not depend on path — curve constants (KAPPA, arc alpha) and flattening logic are re-derived locally across bounds, fill, and commands. Adding the dependency centralizes the shared curve seam and eliminates consistency hazards between passes.

  **Why:** Shape predates path in the monorepo history. The dependency is natural — shape records drawing commands, path owns the curve/geometry kernel shape should reference.

- **[2026-07-02] Buffer representation: keep `unknown[]` for now.** The heterogeneous `unknown[]` retained buffer is the right representation at this stage. It ports to C properly (a tagged union of command entries). A typed-array/pooled variant for per-frame rebuilds is future work if profiling identifies allocation pressure.

  **Why:** The current representation is portable, simple, and correct. Premature optimization of the buffer format would add complexity without a profiling-gated signal.

## Open directions

1. **Scale-9: feature or field?** `Scale9Shape` stores a `scale9Grid` but nothing rewrites commands under it. Does shape own scale-9 distortion (command rewriting so corners pin, edges stretch, center fills) and `computeScale9ShapeLocalBoundsRectangle`? Or is that a render-time operation? Command rewriting is a data-layer transform (one command stream → another), which argues for shape. But the complexity and the render-coordination cost are non-trivial. Needs discussion.

2. **North star: exact formulation.** The broad strokes are settled (recorder, closed format, tessellation delegated, exact bounds). The precise framing — especially how `drawTriangles` fits the "closed buffer" story and whether "exact analytic" extends to every edge case — is still settling.

3. **Robustness policy.** Degenerate inputs (zero/negative radius, NaN/Infinity, odd-length polygon arrays, self-intersecting fills, the arcTo anti-parallel bisector) have no defined policy. A reasonable default: degenerate primitives are no-ops, NaN/Infinity is undefined (programmer error), the polygon odd-length skip is documented as intentional, the arcTo guard already falls back to lineTo. Needs explicit blessing.

4. **Rust `flighthq-shape` crate.** Mirrors the same source files. The deterministic, plain-data functions (bounds, fill extraction, hit testing, typed readback) are prime conformance targets. Sequenced after TS surface stabilizes.
