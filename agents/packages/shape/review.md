---
package: '@flighthq/shape'
status: solid
score: 82
updated: 2026-07-13
ingested:
  - charter.md
  - status.md
  - review.md (prior, 2026-06-24)
  - assessment.md (prior, 2026-07-02)
  - source (packages/shape/src, all 7 source + 6 test files)
  - packages/types/src/ShapeCommand.ts
  - packages/shape/package.json + git log
---

# shape — Review

Rereview against the live worktree at HEAD (`23fcf86c`). Supersedes the 2026-06-24 review, which surveyed the `builder-67dc46d64` bundle; the live tree has since absorbed that work (commit `06a0c480` "recover lost source"), gained the approved correctness sweep (`2e37591e` — cubic extrema, per-span stroke, triangles, path winding), a typed buffer (`6cc3b346` — `ShapeCommandToken` replaces `unknown[]`), and repointed invalidation to `@flighthq/node`'s `invalidateContent` (`23fcf86c`).

## Verdict

`solid — 82/100`. A broad, well-shaped retained `Graphics`-style command recorder with exact analytic bounds, a winding-honoring solid-fill resolver consumed by the gl/wgpu shape renderers, an opt-in hit-test registry, and a typed command buffer. Most of the 2026-07-02 Approved sweep has landed and is verified in source — but two approved items (typed round-trip, path dependency) have not, the landed bounds fixes shipped without behavioral tests, and `drawTriangles` is emitted by the vocabulary while absent from the `ShapeCommandRegistry` header. The code is good; the gap to authoritative is unfinished approved work plus test debt.

## Present capabilities (verified against live source)

- **Command vocabulary** (`shapeCommands.ts`, 24 exported `append*` + a `PathCommand` re-export). Fills (`appendShapeBeginFill`/`BeginGradientFill`/`BeginBitmapFill`/`EndFill`), strokes (`appendShapeLineStyle`/`LineGradientStyle`/`LineBitmapStyle` — caps/joints/miter/scaleMode captured as data), pen path (`MoveTo`/`LineTo`/`CurveTo`/`CubicCurveTo`), primitives (`Circle`/`Ellipse`/`Rectangle`/`RoundRectangle`/`RoundRectangleVarying`), `appendShapePath` raw injection, `appendShapeDrawTriangles`, and arc/polygon builders (`appendShapeArc`, `appendShapeArcTo`, `appendShapePolygon`, `appendShapePolyline`). Arcs decompose at append time into `moveTo`+`cubicCurveTo` via the `(4/3)·tan(θ/4)` approximation (≤4 quarter segments) — the closed-buffer North star holds: every downstream pass handles arcs through the existing cubic path. Every `append*` and mutator calls `invalidateContent(shape)`; revision bumps are test-asserted (`shape.test.ts`).
- **Bounds** (`shape.ts:computeShapeLocalBoundsRectangle`). Exact analytic extrema: quadratic single-root, cubic derivative-quadratic roots (`expandCubicExtrema`), `drawPath` verb decoding (MOVE/LINE/CURVE/WIDE\_\*/CUBIC), `drawTriangles` vertex sweep, and per-span stroke expansion (`strokeHalf` applied inside `expand()` at each point, so mixed-thickness spans each get their own half-width). `getShapeBounds` is the public `out`-first wrapper; the stale aliasing comment flagged by the prior review is gone. `getShapeCommandCount`/`isShapeEmpty` queries present.
- **Fill resolution** (`shapeFill.ts`). `getShapeFillRegions(commands)` → `ShapeFillRegion[] | null` (null = fall back to raster on any gradient/bitmap fill or stroke); primitives expand to path verbs (KAPPA ellipses, per-corner quadratic round-rects), `drawPath` passes through raw and carries its per-path `PathWinding` into the region (no longer hardcoded `nonZero`). `hasNonSolidShapeFill` treats `drawTriangles`-with-uvtData as non-solid. Consumed by `displayobject-gl`/`displayobject-wgpu` (`glShape.ts`, `wgpuShape.ts`). Note the entity overload from the bundle era is gone — the live signature is buffer-only.
- **Hit testing** (`shapeHitTestRegistry.ts` + `shapeHitTestBuiltins.ts`). Open string-keyed registry (`registerShapeHitTestCommand`, `hitTestShapeCommandPoint` → `boolean | null`), opt-in `enableShapeHitTesting()` registering circle/ellipse/rectangle/round-rect handlers; the round-rect handler does true per-corner ellipse containment.
- **Scale-9** (`scale9Shape.ts`). Data-only entity quartet carrying `scale9Grid`; no distortion behavior (matches Open direction #1's undecided state).
- **Types & packaging.** `ShapeCommandRegistry`/`ShapeCommandKey`/`ShapeCommandToken`/`ShapeHitTestCommand` homed in `@flighthq/types` (`ShapeCommand.ts`, with a good durable comment on the buffer layout); `sideEffects: false`, single `.` export. 91 tests across 6 files, `describe` blocks mirror exports.

## Gaps (vs a mature retained-mode vector-Graphics node; geometry → `@flighthq/path`, codecs → `@flighthq/shape-formats` are separate cells)

- **Typed round-trip absent (approved, unlanded).** No `shapeGraphicsData.ts` — no `getShapeGraphicsData`/`forEachShapeCommand`/`appendShapeGraphicsData`, and no `ShapeGraphicsRecord` union in `@flighthq/types`. The charter lists this in scope ("planned") and the 2026-07-02 Approved line names it. Note `@flighthq/shape-formats` (`shapeJson.ts`) meanwhile walks the raw buffer itself — a second hand-rolled decoder that the round-trip surface would subsume.
- **`drawTriangles` missing from `ShapeCommandRegistry`.** `appendShapeDrawTriangles` emits the key and bounds/fill handle it, but the header registry in `types/ShapeCommand.ts` has no `drawTriangles` entry — `ShapeCommandKey` excludes it, so a typed hit-test handler for it cannot be declared. The header layer lags the vocabulary.
- **The 2026-07-02 correctness fixes are untested.** `shape.test.ts`'s bounds describe has only empty/rectangle/lineTo cases — no cubic-extrema, per-span-stroke, drawTriangles, or drawPath bounds test; `shapeFill.test.ts` has no drawPath-winding-carry or drawTriangles-uvtData test. The fixes are verified here by reading source, not by the suite.
- **Stroke geometry is bounds-only.** Style is recorded and widens bounds, but no stroke outline/hit coverage — correctly delegated per Decision #2, so the composed stroke hit-test (shape style + path outline) remains future cross-package work. Miter joints can also exceed the per-point `strokeHalf` expansion (no miterLimit term in bounds).
- **Hit-test builtins cover primitives only** — no pen-path (moveTo/lineTo fill) containment handler, though `shapeFill`'s region output plus path's winding containment would compose one.
- **`appendShapeArcTo` rescans the whole buffer per call** to recover the pen position — O(n²) when appending many arcs; pen state has no home.
- **Robustness policy still unblessed** (Open direction #3): odd-length polygon arrays silently drop the trailing element (`k < points.length - 1`), zero/negative radius and NaN are undefined; the arcTo degenerate guards (zero tangent, parallel) fall back to lineTo as the status noted.

## Charter contradictions

- **Decision #4 ("Shape should depend on `@flighthq/path`") is not implemented — and partially superseded by events.** `package.json` has no path dependency; instead `PathCommand`'s canonical definition moved to `@flighthq/types` (shared with path, per the comment in `shapeCommands.ts`). But the decision's core rationale — one curve seam — is still unmet: KAPPA is re-derived locally in `shapeFill.ts` (`0.5522847498307936`) and **diverges from path's copy** (`path.ts:366` has `0.5522847498308936` — a differing digit; shape's is the correct value). The charter needs either the dependency landed or a superseding decision recording the types-homing route plus a shared-constant home.
- Decision #1 (closed switch in bounds/fill, registry for hit-test) — code matches exactly. Decision #3 (`shape-formats` neighbor) — built. Decision #5 (keep the loose buffer) — upheld, improved to `ShapeCommandToken`. No other contradictions.

## Contract & docs fit

**Lives up to the contract:** full unabbreviated names; `out`-first bounds; `null` sentinels (`getShapeFillRegions`, `hitTestShapeCommandPoint`); types-first homing; single root export; `sideEffects: false`; opt-in registration; invalidation now uniformly through `invalidateContent`. Good hygiene overall.

**Defects / candidate revisions:**

- **False doc comment in `shapeHitTestBuiltins.ts`:** the header claims `enableShapeHitTesting` "also registers a basic point-in-polygon handler for pen-path fills (moveTo/lineTo/curveTo/drawPath)" — only the four primitive handlers are registered. Same class of defect as the prior review's `forEachShapeCommand` finding (that one is moot — the file no longer exists).
- **Odd truncation in the round-rect hit handler:** `((buf[i+4] as number) / 2) | 0 || (buf[i+4] as number) / 2` integer-truncates the corner radius whenever the truncation is nonzero (ellipseWidth 5 → radius 2, not 2.5). Should be a plain `/2` with the existing clamp.
- **`@flighthq/geometry` is a runtime dependency used only by a test** (`shape.test.ts:createRectangle`). Manifest hygiene candidate (verify against `packages:check`'s policy for shipped tests).
- **Package Map line is slightly aspirational:** "geometry delegated to `@flighthq/path`" — the live package neither imports nor depends on path; the sharing is via `@flighthq/types` (`PathCommand`) only. The rest of the line (command vocabulary, fills+strokes, bounds, fill-region resolver, hit-test registry, `Scale9Shape`) matches.
- **`status.md` top entry is stale:** the 2026-06-25 note describes a lean tree missing the arc/polygon surface, but the same day's `06a0c480` recovered it; the log now misleads a successor about what exists.
- Prior review's `ShapeCommand.ts` one-concept-per-file note stands (hit-test types cohabit the registry hub) — still a types-layout-owner candidate, not a defect.

## Candidate open directions

1. **Where does pen state live?** `appendShapeArcTo`'s per-call rescan wants either a runtime pen slot or an explicit pen parameter — a small API-shape decision.
2. **Supersede or land Decision #4:** record whether the types-homed `PathCommand` route replaces the path dependency, and where the shared KAPPA/arc-α constants belong (path's KAPPA is currently a digit off shape's).
3. **Pen-path fill hit-testing:** should shape offer a whole-shape `hitTestShapePoint` composing fill regions + winding containment (via path), rather than only per-command primitive handlers?
4. Standing items: scale-9 feature-or-field (#1), robustness policy (#3), Rust crate (#4) — unchanged from the charter.
