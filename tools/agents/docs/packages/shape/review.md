---
package: '@flighthq/shape'
status: solid
score: 84
updated: 2026-06-24
ingested:
  - status.md
  - source
  - changes.patch
  - charter.md
---

# shape — Review

Evidence: `incoming/builder-67dc46d64/head/packages/shape/` + `changes.patch`. Findings reference `67dc46d64:<path>`. The prior depth review (`reviews/depth/shape.md`) no longer exists in the tree — the charter's "seeded from the prior depth review" line is the only residue — so this survey is the new baseline.

## Verdict

`solid — 84/100`. A broad, well-shaped `Graphics`-style retained command vocabulary with exact analytic bounds, a solid-fill region resolver, an opt-in hit-test registry, and a typed round-trip over the flat command buffer. It is the most complete it has been, and the status doc's inventory is largely accurate. The 84 (below the worker's self-estimated 93) reflects this review's stricter bar: two doc/code contradictions, an unverifiable aliasing claim, a registry/closed-switch asymmetry that fork B flags, and a charter that is still a stub so most of "what good means here" is assumed, not confirmed. The code is good; the score is a survey of distance to authoritative, not a grade on the diff.

## Present capabilities (verified against source)

**Command vocabulary** (`shapeCommands.ts`, 23 exported `append*`). Fills (`appendShapeBeginFill`/`BeginGradientFill`/`BeginBitmapFill`/`EndFill`), strokes (`appendShapeLineStyle`/`LineGradientStyle`/`LineBitmapStyle`), pen path (`MoveTo`/`LineTo`/`CurveTo`/`CubicCurveTo`), primitives (`Circle`/`Ellipse`/`Rectangle`/`RoundRectangle`/`RoundRectangleVarying`), raw path injection (`appendShapePath`), indexed mesh (`appendShapeDrawTriangles`), and the pass-2 additions (`appendShapeArc`, `appendShapeArcTo`, `appendShapePolygon`, `appendShapePolyline`) — all confirmed present and exported. Exported functions are alphabetized and `shapeCommands.test.ts` `describe` blocks mirror them 1:1 (36 `it`s). Arcs decompose at append-time into `moveTo`+`cubicCurveTo` via the `(4/3)·tan(θ/4)` approximation split into ≤4 quarter segments — a deliberate choice that keeps the buffer format closed and lets bounds/fill/hit-test handle arcs through the existing cubic path for free. This is the right call and is documented in source.

**Bounds** (`shape.ts:computeShapeLocalBoundsRectangle`). Exact analytic extrema: quadratic via the single derivative root per axis, cubic via `expandCubicExtrema` (derivative-quadratic root solve), `drawTriangles` by vertex sweep, `drawPath` by decoding the `PathCommand` verb stream (incl. WIDE\_\* and CUBIC_CURVE_TO). Stroke expansion is now per-span: `strokeHalf` is applied inside `expand()` at each point, so two segments of different `lineStyle` thickness each get their own half-width — a genuine correctness fix over the old global last-style expansion. `getShapeBounds` is the public allocation-explicit `out` wrapper; `getShapeCommandCount` and `isShapeEmpty` are O(n)/O(1) queries.

**Fill resolution** (`shapeFill.ts`). `getShapeFillRegions` walks the buffer into `ShapeFillRegion[]` (primitives expanded to MOVE/LINE/CURVE/CUBIC verbs, KAPPA ellipses, per-corner quadratic round rects, raw `drawPath` pass-through honoring per-path winding), returning `null` the moment any gradient/bitmap fill or any stroke appears so the caller falls back to raster. `hasNonSolidShapeFill` is the standalone guard, and `drawTriangles`-with-uvtData correctly counts as non-solid. Both accept a raw buffer or a `Shape` entity via an `isShape` guard.

**Hit testing** (`shapeHitTestRegistry.ts` + `shapeHitTestBuiltins.ts`). An open string-keyed registry (`registerShapeHitTestCommand`, `hitTestShapeCommandPoint` → `boolean | null`, null = no handler) plus an opt-in `enableShapeHitTesting()` that registers circle/ellipse/rectangle/round-rect handlers. The round-rect handler does true per-corner ellipse-containment (excludes corner cutouts), not a bounding-box test — verified in source and covered by two tests.

**Typed round-trip** (`shapeGraphicsData.ts`). `getShapeGraphicsData` → `readonly ShapeGraphicsRecord[]`, `forEachShapeCommand(source, visitor)` walk, and `appendShapeGraphicsData` write/replay close the loop over the flat `[key, argCount, ...args]` buffer. The `ShapeCommandRegistry`/`ShapeGraphicsRecord` discriminated-union typing lives in `@flighthq/types`.

**Scale-9** (`scale9Shape.ts`). Full entity quartet (`createScale9Shape`/`Data`/`Runtime`/`getScale9ShapeRuntime`) carrying a `scale9Grid` field. `Scale9Shape`/`Scale9ShapeData`/`Scale9ShapeKind` are homed in `@flighthq/types`. Note this is data-only: no scale-9 distortion logic lives here.

**Types & packaging.** `TriangleCulling`, `ShapeFillRegion`, `Scale9Shape`, `ShapeCommand*` all in `@flighthq/types` and exported from its barrel. `package.json` is `sideEffects: false`, single `.` export, deps limited to displayobject/geometry/node/types. Entity quartet on `Shape` is correct.

## Gaps (vs the AAA `Graphics` target; charter silent, so codebase-map standard applies)

- **No scale-9 behavior.** `Scale9Shape` stores a grid but nothing rewrites commands under it, and there is no `computeScale9ShapeLocalBoundsRectangle`. The package's own charter names "scale-9 grid stretching" as in-scope; today it is a field, not a feature.
- **Stroke geometry is bounds-only.** `lineStyle` widens bounds and gates fill, but nothing produces a stroke _outline_ (caps/joints/miter) as geometry, and the built-in hit-tests cover fills only — a point on a thin stroked line with no fill misses. Caps/joints/scaleMode/pixelHinting are captured in the command but inert here.
- **No serialization.** No stable JSON form of the command stream (`serialize*`/`parse*`); the typed round-trip is in-memory only. Status parks this as a `@flighthq/shape-formats` neighbor pending a schema decision — correctly deferred (triad/plurality), but it is a real gap toward a tooling-grade library.
- **No flattening seam.** Bounds, fill-region extraction, and hit testing each re-derive curve math with their own constants (KAPPA in fill, the arc α in commands, analytic extrema in bounds). There is no shared tolerance/flattening policy and no `@flighthq/path` dependency — a consistency hazard the status itself flags as Silver.
- **`number[]` command buffer.** Heterogeneous `unknown[]` array-of-everything; no typed-array / pooled variant, no `acquire*/release*` for `ShapeFillRegion`. Fine for retained use, a per-frame rebuild allocates.
- **Robustness unspecified.** Degenerate inputs (zero/negative radius, NaN/Infinity, odd-length polygon arrays — see below, self-intersecting fills) have no defined policy.
- **Graphics parity holes.** No `beginShaderFill`/`lineShaderStyle`, no `drawQuads`/`drawTiles` (these overlap `@flighthq/sprite` and are correctly cross-package-deferred).

## Charter contradictions

The charter's "What it is" is the only non-stub section, and the code matches it: this _is_ the display node + command stream, with tessellation/boolean-ops correctly left to a sibling `path` kernel (the package has no `@flighthq/path` dependency, consistent with that boundary). North star, Boundaries, and Decisions are all `TODO`, so there is little to contradict. One soft tension worth surfacing: the charter lists "scale-9 grid stretching" as identity, but the code only stores the grid — so the stated identity over-promises relative to the implementation. Not a violation of a blessed rule (there is none yet), but the charter and code disagree on whether scale-9 is a feature or a field.

## Contract & docs fit

**Lives up to the contract:** full unabbreviated names (`computeShapeLocalBoundsRectangle`, not `computeShapeBounds`); `out`-param bounds; sentinel returns (`getShapeFillRegions` → `null`, `hitTestShapeCommandPoint` → `null`); types-first in `@flighthq/types`; single `.` export; `sideEffects: false`; opt-in registration (`enableShapeHitTesting` is not called at module top level). `crate: flighthq-shape` mirror is named in the charter front matter. Good contract hygiene overall.

**Defects / candidate revisions:**

- **`forEachShapeCommand` doc is false.** Its comment states "Does not allocate; the record object is reused across calls (do not hold a reference between calls)." The source (`67dc46d64:shapeGraphicsData.ts:29-30`) allocates a fresh `{ key, args }` record _and_ a fresh `commands.slice(...)` args array every call. `getShapeGraphicsData`'s own inline comment contradicts the `forEach` header ("a new object is already created per call"). Either make it genuinely reuse a scratch record (then the "do not hold a reference" warning becomes true) or fix the comment to say it allocates. As written the contract promise is wrong — an agent relying on "allocation-free walk" in a hot loop would be misled.
- **`getShapeBounds` aliasing comment is meaningless.** The comment says "`out` may alias the shape if needed (the shape is read-only here)," but `out: Rectangle` and `source: Shape` are different types that cannot alias. The note reads as boilerplate copied from a true alias-safe function; it should be removed or replaced with the real invariant (bounds is computed into `out` with no reads of `out`).
- **`number[]`-style closed `switch(key)` in bounds and fill vs. open registry in hit-test (fork B).** `computeShapeLocalBoundsRectangle`, `getShapeFillRegions`, and `hasNonSolidShapeFill` dispatch over a hardcoded `switch` on the command-key string, while hit-testing uses an extensible registry. Per [structural fork B](../structural-forks.md#b-closed-union-vs-open-registry-decided-with-nuance), a closed switch taxes every shape consumer with every command kind and blocks vendor-prefixed custom commands from participating in bounds/fill — yet a user _can_ register a custom hit-test. This asymmetry is the package's clearest fork-fit drift: either all three passes become registries (open, tree-shakable, custom-command-capable) or the closed switch is a blessed "tight loop in a closed system" exception — a decision the charter should record. The command family is small and stable, so the exception is defensible, but it should be _chosen_, not incidental.
- **`ShapeGraphicsRecord` / `ShapeCommandKey` / `ShapeHitTestCommand` / `ShapeCommandHitTest` share `ShapeCommand.ts`.** The types-layout convention is one-concept-per-file (filename = type name). `ShapeCommand.ts` is a registry hub (the `ShapeCommandRegistry` interface plus its derived types/style aliases), which is a reasonable cohesion exception, but `ShapeGraphicsRecord` and the hit-test command types are arguably their own concepts (a `ShapeGraphicsRecord.ts` / `ShapeHitTestCommand.ts` split). Candidate revision for the types-layout owner, not a defect.
- **Package Map line is accurate** and needs no revision — "vector Shape display node … command vocabulary, fills and strokes, scale-9, bounds, per-command hit testing" matches the code (with the scale-9 caveat above applying to both).

## Candidate open directions (charter is a stub — these are the questions it should settle)

1. **North star.** What is the durable bar? Likely: exact analytic measurement (no flattening for bounds), a closed stable buffer format, and tessellation strictly delegated to `@flighthq/path`. Confirm so future work is judged against it.
2. **Closed switch vs. registry (fork B) for bounds/fill.** Bless the closed `switch` as the intentional tight-loop exception, or commit to a uniform command registry across bounds/fill/ hit-test. The hit-test/bounds asymmetry needs an explicit ruling.
3. **Is scale-9 a feature or a field?** Decide whether `@flighthq/shape` owns scale-9 _distortion_ (command rewriting + `computeScale9ShapeLocalBoundsRectangle`) or whether that belongs to the renderers / a neighbor. The charter currently claims the feature; the code provides only storage.
4. **Stroke geometry ownership.** Does shape produce stroke _outlines_ (caps/joints) and hit-test them, or is stroke-to-geometry a `@flighthq/path` concern that shape only references? Today strokes affect bounds but produce no outline and no hit coverage.
5. **`shape-formats` neighbor.** Approve/deny the JSON serialization neighbor and, if approved, the versioned `ShapeCommandJson` schema (coordinate with the types-layout owner). Parked in status as needing a design decision.
6. **Flatten-consistency / `@flighthq/path` dependency.** Whether to centralize curve flattening tolerance (and KAPPA/arc-α constants) in a shared seam, accepting a `path` dependency. Cross-package.
7. **Buffer representation.** Keep the `unknown[]` retained buffer, or add a typed-array/pooled hot variant for per-frame rebuilds (Gold). Affects the Rust `flighthq-shape` mirror's representation.

## Notes for status verification (as-claimed → verified)

The worker status doc checks out against the diff: 110 tests confirmed (`grep` over the 7 `*.test.ts`), all listed `append*` functions present and exported, per-span stroke bounds and per-corner round-rect hit-test confirmed in source. The status's own "concerns" are accurate and worth keeping live: the `appendShapeArcTo` near-anti-parallel bisector edge case, the 12-arg `expandCubicExtrema` signature, the module-level hit-test `Map` (global registration), and the `appendShapePolygon` odd-length silent-skip (`k < points.length - 1`, step 2). The self-estimated 93 is optimistic against this review's distance-to-authoritative bar, but the _inventory_ it claims is real.
