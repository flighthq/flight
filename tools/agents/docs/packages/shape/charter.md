---
package: '@flighthq/shape'
crate: flighthq-shape
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# shape — Charter

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

## What it is

Vector `Shape` display node — the Flash/OpenFL `Graphics`-style retained drawing-command API. It owns a flat command vocabulary (`moveTo`/`lineTo`/quadratic + cubic curves, arcs, primitives circle/ellipse/rectangle/round-rect, polygon/polyline, raw path injection, indexed `drawTriangles`), solid/gradient/bitmap fills and strokes, exact analytic local-bounds measurement, a solid-fill region resolver (`getShapeFillRegions`, with a raster-fallback sentinel), an opt-in per-command hit-test registry, a typed round-trip over the flat command buffer (`getShapeGraphicsData` / `forEachShapeCommand` / `appendShapeGraphicsData`), and a data-only `Scale9Shape` entity carrying a `scale9Grid`.

Where it ends and a neighbor begins: this package owns the **display node and its command stream**, not a geometry kernel. General path tessellation and boolean operations belong to a sibling `@flighthq/path` (not yet a dependency here). Gradient/bitmap fills and strokes are _recorded and measured_ here but _rasterized_ by the `displayobject-<backend>` renderers. Quad/tile batch drawing (`drawQuads`/`drawTiles`) overlaps `@flighthq/sprite` and is deferred there. JSON serialization of the command stream is parked as a possible `@flighthq/shape-formats` neighbor, not in scope here.

## North star (proposed)

_Proposed — confirm or rewrite. Inferred from the design + the SDK structural forks; not yet blessed._

- **Exact analytic measurement.** Bounds are computed from closed-form curve extrema (quadratic derivative root, cubic `expandCubicExtrema`, KAPPA ellipses), never by flattening — measurement is exact and allocation-explicit (`getShapeBounds` writes an `out` rectangle).
- **A closed, stable, serializable buffer format.** The command stream is a flat `[key, argCount, ...args]` buffer; new primitives (arcs, polygons) decompose at append-time into the existing curve/line verbs so the buffer format stays closed and every downstream pass (bounds/fill/hit-test) handles them for free. The string command keys are the round-trip and (future) serialized form.
- **Tessellation is delegated, not owned.** Curve→line flattening, boolean ops, and stroke-outline geometry are a `@flighthq/path` concern; `shape` references that kernel rather than re-deriving curve math per pass.
- **Plain data, explicit allocation, sentinels.** Full unabbreviated names (`computeShapeLocalBoundsRectangle`), `out`-param math, `null` sentinels for "fall back to raster" / "no handler", opt-in registration (`enableShapeHitTesting`), `sideEffects: false`, types-first in `@flighthq/types`. Conforms 1:1 with the Rust `flighthq-shape` mirror.

## Boundaries (proposed)

_Proposed — confirm or rewrite._

**In scope:**

- The `Shape` display node, its runtime quartet, and the retained command vocabulary.
- Recording fills (solid/gradient/bitmap) and strokes (caps/joints/scaleMode captured as data).
- Exact local-bounds measurement, solid-fill region extraction, and per-command hit testing.
- The typed in-memory round-trip over the command buffer.
- Holding `Scale9Shape` data (the `scale9Grid` field).

**Open / unsettled boundaries (see Open directions):**

- Whether scale-9 _distortion_ (command rewriting + `computeScale9ShapeLocalBoundsRectangle`) lives here or in the renderers/a neighbor — today only the grid is stored.
- Whether `shape` produces stroke _outline_ geometry and hit-tests strokes, or defers that to `@flighthq/path`.

**Out of scope:**

- General path tessellation / boolean ops (→ `@flighthq/path`).
- Rasterization of any fill or stroke (→ `displayobject-<backend>`).
- Quad/tile batch drawing — `drawQuads`/`drawTiles` (→ `@flighthq/sprite`).
- On-disk JSON serialization of the command stream (→ possible `@flighthq/shape-formats`).
- Shader fills — `beginShaderFill`/`lineShaderStyle` (cross-package, deferred).

## Decisions

None blessed yet.

## Open directions

_Every candidate question carried from `review.md`, plus the structural forks that touch this package. An agent asks here rather than assuming._

1. **North star confirmation.** Is the durable bar "exact analytic measurement (no flattening for bounds) + a closed stable buffer format + tessellation delegated to `@flighthq/path`"? Confirm so future work is judged against it.
2. **Closed switch vs. registry (structural [fork B](../structural-forks.md#b-closed-union-vs-open-registry-decided-with-nuance)).** `computeShapeLocalBoundsRectangle`, `getShapeFillRegions`, and `hasNonSolidShapeFill` dispatch over a hardcoded `switch(key)`, while hit-testing uses an extensible registry. Either bless the closed switch as the intentional "tight loop in a closed, small, stable command family" exception, or commit all three passes to a uniform open command registry (tree-shakable, custom-command-capable). The hit-test/bounds asymmetry needs an explicit ruling.
3. **Is scale-9 a feature or a field?** The charter "What it is" historically claimed scale-9 grid _stretching_, but the code only stores the grid. Decide whether `@flighthq/shape` owns scale-9 _distortion_ (command rewriting + `computeScale9ShapeLocalBoundsRectangle`) or whether that belongs to the renderers / a neighbor.
4. **Stroke geometry ownership.** Does `shape` produce stroke _outlines_ (caps/joints/miter) as geometry and hit-test them, or is stroke-to-geometry a `@flighthq/path` concern that `shape` only references? Today strokes widen bounds and gate fill but produce no outline and no stroke hit coverage.
5. **`shape-formats` neighbor.** Approve or deny the JSON serialization neighbor, and if approved, the versioned `ShapeCommandJson` schema (coordinate with the types-layout owner). Parked in status as needing a design decision; subject to the triad **plurality guard** ([fork B / triad](../structural-forks.md#the-recurring-shape-the-subject-triad)).
6. **Flatten-consistency / `@flighthq/path` dependency.** Bounds, fill, and commands each re-derive curve constants (KAPPA in fill, arc α in commands, analytic extrema in bounds). Centralize a shared flattening-tolerance / curve-constant seam, accepting a `@flighthq/path` dependency? Cross-package.
7. **Buffer representation (Gold).** Keep the heterogeneous `unknown[]`/`number[]` retained buffer, or add a typed-array/pooled hot variant (with `acquire*`/`release*` for `ShapeFillRegion`) for per-frame rebuilds? This choice also constrains the Rust `flighthq-shape` mirror's representation (structural [fork D](../structural-forks.md#d-two-seam-dimensions--runtime-backend-vs-wasm-mixing-distinguish): `shape` is a candidate value-typed mixable leaf).
8. **Robustness policy.** Define behavior for degenerate inputs — zero/negative radius, NaN/Infinity, odd-length polygon arrays (`appendShapePolygon` currently silently skips the trailing point), self-intersecting fills, the `appendShapeArcTo` near-anti-parallel bisector edge case.
9. **Doc/code defects to settle (from review).** `forEachShapeCommand`'s "does not allocate / record reused" comment is false (it allocates a fresh record + sliced args each call) — make it genuinely reuse a scratch record or fix the comment. `getShapeBounds`'s aliasing comment is meaningless (`out: Rectangle` and `source: Shape` cannot alias) — remove or replace with the real invariant. `ShapeGraphicsRecord` / hit-test command types sharing `ShapeCommand.ts` vs. the one-concept-per-file convention — a types-layout split decision.
