---
package: '@flighthq/shape'
updated: 2026-06-24
basedOn: ./review.md
---

# shape — Assessment

Sorted from `review.md` (score `solid — 84`). The prior `reviews/depth/shape.md` / `reviews/maturation/depth/shape.md` roadmap no longer exists in the tree (the review confirms it was already absorbed and superseded), so `review.md` is the sole evidence. The charter is still a stub — North star, Boundaries, and Decisions are all `TODO` — so most of "what good means here" is an open design question, which keeps `Recommended` deliberately small: the genuinely sweep-safe items are the two false in-source doc claims and a couple of degenerate-input policies. Every structural fork the review raises (fork B closed-switch-vs-registry, scale-9 feature-vs-field, stroke-geometry ownership, the `shape-formats` neighbor, the `@flighthq/path` flatten seam) is a charter decision or crosses a package boundary, so it is routed to the charter's Open directions, not into `Recommended`.

## Recommended

Strictly sweep-safe: within `@flighthq/shape`, no cross-package coupling, no breaking change, no open design decision.

- **Fix the false `forEachShapeCommand` allocation doc.** The header comment claims "Does not allocate; the record object is reused across calls (do not hold a reference between calls)," but `shapeGraphicsData.ts` allocates a fresh `{ key, args }` record _and_ a fresh `commands.slice(...)` args array every call (and `getShapeGraphicsData`'s own inline comment already contradicts it). Correct the comment to state it allocates per call (and drop the now-meaningless "do not hold a reference" warning). A pure in-source doc fix — no signature change. — review.md (Contract & docs fit, defect 1).

- **Remove/replace the meaningless `getShapeBounds` aliasing comment.** The comment says "`out` may alias the shape if needed (the shape is read-only here)," but `out: Rectangle` and `source: Shape` are different types that cannot alias — boilerplate copied from a true alias-safe function. Remove it or replace it with the real invariant (bounds is computed into `out` with no reads of `out`). In-source comment fix only. — review.md (Contract & docs fit, defect 2).

- **Define and document a degenerate-input policy for the append helpers (within current behavior).** The status's own live concerns name two concrete cases already in the code: `appendShapePolygon` silently skips a trailing odd coordinate (`k < points.length - 1`, step 2), and `appendShapeArcTo` has a near-anti-parallel bisector edge case. These are within-package and need no design ruling — pin the behavior down (document the silent-skip as intentional or guard it; document/clamp the bisector degeneracy) and add a colocated test for each so the policy is enforced, not incidental. Broader degenerate cases (zero/negative radius, NaN/Infinity, self-intersecting fills) can fold into the same policy as their behavior is decided. — review.md (Gaps: "Robustness unspecified"; Notes for status verification).

## Backlog

Parked: needs a charter decision, crosses a package boundary, belongs to another doc's owner, or is larger than a sweep. Each carries why.

- **Scale-9 distortion behavior** (`computeScale9ShapeLocalBoundsRectangle` + command rewriting under the grid). Today `Scale9Shape` stores a grid but nothing stretches anything. **Parked:** the charter names scale-9 as identity while the code provides only storage — whether shape _owns_ the distortion or it belongs to the renderers/a neighbor is an Open direction (routed below), not a sweep.

- **Stroke outline geometry + stroke hit-testing** (caps/joints/miter as geometry; hit a thin stroked line with no fill). **Parked:** ownership is an open design fork — stroke-to-outline may be a `@flighthq/path` concern shape only references. Routed to Open directions.

- **Fork B: open the bounds/fill command dispatch into a registry (or bless the closed switch).** `computeShapeLocalBoundsRectangle`, `getShapeFillRegions`, and `hasNonSolidShapeFill` use a closed `switch(key)` while hit-testing uses an open registry — the package's clearest fork-fit drift. Per [structural fork B](../structural-forks.md#b-closed-union-vs-open-registry-decided-with-nuance) the default is a registry, but the family is small and stable so the closed switch is a defensible "tight loop in a closed system" exception. **Parked:** this is exactly an API-shape design decision the charter must record — not sweep-safe. Routed to Open directions.

- **`@flighthq/shape-formats` neighbor + stable JSON serialization** (`serialize*`/`parse*`, a versioned `ShapeCommandJson` schema). **Parked:** cross-package (new triad cell) and needs a schema decision coordinated with the types-layout owner; correctly deferred under the triad/plurality guard. Routed to Open directions.

- **Shared flattening/tolerance seam + `@flighthq/path` dependency.** Bounds, fill, and hit-test each re-derive curve math with their own constants (KAPPA, arc α, analytic extrema). **Parked:** cross-package — centralizing tolerance implies a `path` dependency, a boundary decision. Routed to Open directions.

- **Typed-array / pooled hot buffer variant** (replace or supplement the `unknown[]` command buffer; `acquire*/release*` for `ShapeFillRegion`). **Parked:** larger than a sweep and affects the Rust `flighthq-shape` mirror's representation — a representation decision, Gold-tier. Routed to Open directions (buffer representation).

- **Split `ShapeGraphicsRecord` / hit-test command types out of `ShapeCommand.ts`** (one-concept- per-file: `ShapeGraphicsRecord.ts` / `ShapeHitTestCommand.ts`). **Parked:** the file lives in `@flighthq/types`; this is a candidate revision for the types-layout owner, not within `shape`.

- **Graphics parity holes** — `beginShaderFill`/`lineShaderStyle`, `drawQuads`/`drawTiles`. **Parked:** `drawQuads`/`drawTiles` overlap `@flighthq/sprite` (cross-package); shader fills depend on the materials/shader seam. Out of a within-package sweep.

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._

## Notes for the charter's Open directions

Surfaced for an explicit direction conversation (do not edit the charter here). The review already enumerates these as candidate Open directions; the assessment confirms they are the design forks that keep the bulk of the backlog parked:

1. **North star** — confirm the durable bar (likely: exact analytic measurement / no flattening for bounds, a closed stable buffer format, tessellation delegated to `@flighthq/path`).
2. **Fork B for bounds/fill** — bless the closed `switch` as the intentional tight-loop exception, or commit to a uniform command registry across bounds/fill/hit-test (resolve the hit-test/bounds asymmetry).
3. **Scale-9: feature or field** — does `shape` own scale-9 distortion (command rewriting + `computeScale9ShapeLocalBoundsRectangle`) or only storage?
4. **Stroke geometry ownership** — does `shape` produce/hit-test stroke outlines, or is that a `@flighthq/path` concern it references?
5. **`shape-formats` neighbor** — approve/deny the JSON serialization neighbor and its versioned schema (coordinate with the types-layout owner).
6. **Flatten-consistency / `@flighthq/path` dependency** — centralize curve-flattening tolerance and the KAPPA/arc-α constants in a shared seam? (cross-package)
7. **Buffer representation** — keep `unknown[]`, or add a typed-array/pooled hot variant (affects the Rust mirror).
