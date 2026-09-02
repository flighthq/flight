---
package: '@flighthq/shape'
status: solid
score: 88
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - review.md (prior, 2026-08-25)
  - assessment.md (prior, 2026-08-04)
  - source (packages/shape/src, all 18 source + 18 test files)
  - packages/types/src/ShapeCommand.ts
  - packages/types/src/ShapeBounds.ts
  - packages/types/src/ShapeTessellationExplanation.ts
  - packages/types/src/ShapeStrokeRegion.ts
  - packages/types/src/StrokeStyle.ts
  - packages/types/src/MorphShape.ts
  - packages/shape/package.json
---

# shape -- Review

Full rereview against live source. Supersedes the 2026-08-25 review. Since that review, the package has gained stroke-region resolution (`getShapeStrokeRegions`), GPU-tessellated stroke outlines (`getShapeStrokeOutlineRegions` + `compactStrokePath`), a tessellation diagnostic (`explainShapeTessellation`), and the KAPPA-divergence issue has been resolved by consolidating on `CIRCLE_KAPPA` from `@flighthq/math`. The `drawTriangles` header gap is also closed.

## Verdict

`solid -- 88/100`. A well-shaped retained `Graphics`-style command recorder that has matured materially since the prior review. The package now covers the full fill-and-stroke extraction pipeline for GPU rendering, with dedicated stroke outline generation, real join/cap/dash geometry, and a clear tessellation diagnostic. The bounds system has moved from a closed switch to an open registry with explicit registration, guards, and explanation. The KAPPA constant divergence is resolved. The `drawTriangles` header-registry gap is closed. MorphShape compound geometry and paint morphing is complete.

The remaining distance to authoritative is: the typed round-trip surface (chartered, not built), test coverage gaps for `drawTriangles` bounds / `drawPath` winding carry / stroke outline and compact-stroke internals, and the `appendShapeArcTo` O(n^2) rescan of the command buffer. The code is clean, correctly factored, and the API naming is consistent.

## Present capabilities (verified against live source)

- **Command vocabulary** (`shapeCommands.ts`, 24 exported `appendShape*` functions + `PathCommand` re-export). Fills (solid/gradient/bitmap via `appendShapeBeginFill`/`BeginGradientFill`/`BeginTextureFill`/`EndFill`), strokes (`appendShapeLineStyle`/`LineGradientStyle`/`LineTextureStyle` with caps/joints/miter/scaleMode captured as data), pen path (`MoveTo`/`LineTo`/`CurveTo`/`CubicCurveTo`), primitives (`Circle`/`Ellipse`/`Rectangle`/`RoundRectangle`/`RoundRectangleVarying`), raw path injection (`appendShapePath`), `appendShapeDrawTriangles`, and arc/polygon builders (`appendShapeArc`, `appendShapeArcTo`, `appendShapePolygon`, `appendShapePolyline`). Arc decomposition uses the `(4/3)*tan(theta/4)` cubic approximation. Every `appendShape*` and `clearShapeCommands`/`copyShapeCommands` calls `invalidateContent(shape)`.

- **Bounds** (`shapeBounds.ts` + `shapeBoundsRegistry.ts` + `registerDefaultShapeBoundsCommands.ts`). The bounds system uses an open registry (`registerShapeBoundsCommand`) keyed by command name, with explicit opt-in via `registerDefaultShapeBoundsCommands()`. Each command binding contributes separately to a fill context and a stroke context, supporting `fill`-only and `ink`-inclusive modes. The fill lane expands points and curves into an accumulator; the stroke lane tracks segment tangents and resolves miter, bevel, and round joins, square cap extension, and `closePath`-to-first-segment joins. Cubic extrema use per-axis derivative solving. Quadratic extrema use the single-root formula. `computeShapeBoundsRectangle` returns `false` for incomplete streams (missing command keys) and a guard seam (`setShapeBoundsGuard`) notifies separately-installed diagnostics. Registry revision tracking invalidates cached bounds when new commands are registered. `explainShapeBounds` reports each missing command key once.

- **Bounds guards** (`enableShapeBoundsGuards.ts`). Opt-in diagnostics via `enableShapeBoundsGuards()` / `disableShapeBoundsGuards()` / `areShapeBoundsGuardsEnabled()`, using `@flighthq/log`'s `logOnce` so tree-shaking sheds both the logger and the warning text when the guard module is not imported.

- **Fill resolution** (`shapeFill.ts`). `getShapeFillRegions(commands)` returns `ShapeFillRegion[] | null` (null = fall back to raster for any gradient/texture fill or textured triangles). Primitives expand to path verbs using `CIRCLE_KAPPA` from `@flighthq/math/contract` (constant-divergence issue resolved). `drawPath` passes through raw and carries its per-path `PathWinding` into the region. `hasNonSolidShapeFill` and `hasShapeFill` are separate exported queries. `appendShapeGeometryCommand` is the shared expansion function used by both fill and stroke walkers. `getPathCommandOperandCount` maps verb to operand width for cursor alignment.

- **Stroke resolution** (`shapeStroke.ts`). `getShapeStrokeRegions(commands)` resolves each solid `lineStyle` span into a `ShapeStrokeRegion` carrying the authored centerline + `StrokeStyle` (join/cap/miterLimit). Returns null for gradient/bitmap strokes. Maps CapsStyle `none` to StrokeStyle `butt`. The centerline retains curve verbs for the backend's tessellator. `hasNonSolidShapeStroke` is an exported query.

- **Stroke outline resolution** (`shapeStrokeOutline.ts` + `compactStrokePath.ts`). `getShapeStrokeOutlineRegions(commands)` converts solid open strokes into `ShapeFillRegion[]` via `compactStrokePath`, which pre-flattens curves and builds left/right offset contours with real miter/bevel/round joins, butt/round/square caps, and dash pattern support. Returns null for closed strokes (deferred to raster path) or gradient/bitmap strokes. Closed-path detection handles CLOSE verbs, return-to-start polylines, and self-closing primitives. The result is a fillable outline the GPU tessellator draws with the same solid-fill mesh path.

- **Tessellation diagnostic** (`explainShapeTessellation.ts`). `explainShapeTessellation(commands, strokePathTessellationEnabled?)` returns a `ShapeTessellationExplanation` with a status (`tessellates` | `needs-rasterizer`) and a `blockedBy` reason, distinguishing non-solid fill, non-solid stroke, and stroke-outline limitations.

- **MorphShape** (`morphShape.ts`, `morphShapePaint.ts`, `morphShapeAnimation.ts`). `createMorphShape` establishes a primary `PathMorph` binding; `appendMorphShapePath` adds independently prepared morphs to the same command stream. Paint appenders (`appendMorphShapeBeginFill`, `BeginGradientFill`, `BeginTextureFill`, `LineStyle`, `LineGradientStyle`, `LineTextureStyle`) retain stable start/end bindings for solid colors/alpha, gradient stops/matrices/focal ratios, bitmap matrices, and stroke width/color. `setMorphShapeProgress` samples all geometry and paint before one `invalidateContent`. `applyAnimationClipToMorphShape` and `applyMorphShapeAnimationSample` bind the target-free animation substrate. `explainMorphShapeGradientEndpoints` returns detached validation data. RGBA interpolation uses per-channel byte rounding.

- **Scale-9** (`scale9Shape.ts`, `scale9ShapeCommands.ts`). Data entity quartet with `scale9Grid`, plus `mapScale9ShapeCommands` which rewrites a command stream through a `Scale9Mapper` (nine-slice coordinate remapping for moveTo/lineTo/curveTo/cubicCurveTo/drawRectangle/drawEllipse/drawRoundRectangle/drawCircle/drawPath). In-place rewrite is supported.

- **Types and packaging.** `ShapeCommandRegistry`, `ShapeCommandKey`, `ShapeCommandToken`, `ShapeBoundsCommand`, `ShapeBoundsContext`, `ShapeBoundsExplanation`, `ShapeBoundsGuard`, `ShapeTessellationExplanation`, `StrokeStyle`, `ShapeStrokeRegion` are all homed in `@flighthq/types`. `drawTriangles` is present in `ShapeCommandRegistry` (header gap from prior review is closed). `sideEffects: false`. Two blessed export lanes (`.` and `./contract`). Dependencies: `@flighthq/animation`, `@flighthq/geometry`, `@flighthq/log`, `@flighthq/math`, `@flighthq/node`, `@flighthq/path`, `@flighthq/scene2d`, `@flighthq/types`. 18 source files, 18 test files, ~6000 lines total, ~100 `it()` test cases.

## Gaps

- **Typed round-trip absent (chartered, not built).** No `getShapeGraphicsData`, `forEachShapeCommand`, `appendShapeGraphicsData`, or `ShapeGraphicsRecord`. The charter lists this in scope ("planned"). `@flighthq/shape-formats` still hand-rolls its own raw-buffer walk.

- **`drawTriangles` has no registered bounds handler.** `registerDefaultShapeBoundsCommands` does not register a handler for `drawTriangles`. A shape containing `drawTriangles` gets an incomplete bounds result (the guard reports the missing key), even though the vocabulary emits it and `hasNonSolidShapeFill` handles it. The `defaultShapeBoundsExpandPointPairs` handler exists and could serve as its vertex-sweep bounds contribution.

- **Test coverage gaps for landed correctness features.** `shapeFill.test.ts` has no `drawPath`-winding-carry test (no `evenOdd` case at all) and no `drawTriangles`-with-`uvtData` non-solid test. `shapeStrokeOutline.test.ts` is 31 lines (2 tests); `compactStrokePath.test.ts` is 31 lines (2 tests) -- neither covers dash patterns, round caps, round/miter joins, or cubic/quadratic curve flattening. The `compactStrokePath` function is ~550 lines with substantial join/cap/dash logic; test depth is low relative to surface area.

- **Stroke outline covers open strokes only.** Closed strokes (rectangles, ellipses, closed polygons, drawPath with CLOSE) return null from `getShapeStrokeOutlineRegions` and defer to the raster path. This is documented and intentional (the comment explains the hollow-ring tessellation constraint), but it means the GPU stroke outline route cannot express the most common shape primitives.

- **`appendShapeArcTo` rescans the whole command buffer per call** (`shapeCommands.ts:62-82`) to recover the pen position. O(n^2) for a run of arcs. Pen state has no home -- a runtime slot or explicit parameter is the API-shape decision.

- **`appendShapePolygon` silently drops the trailing element of an odd-length array** (`shapeCommands.ts:304`: `k < points.length - 1` stepping by 2). Robustness policy for degenerate inputs is still unblessed (Open direction #3).

- **`isShapeGeometryCommand` and `hasNonSolidShapeStroke` are duplicated.** `isShapeGeometryCommand` is an identical private function in both `shapeStroke.ts:91` and `shapeStrokeOutline.ts:150`. `hasNonSolidShapeStroke` exists as an exported function in `shapeStroke.ts:81` and as a private copy in `shapeStrokeOutline.ts:105`. The outline module could import both from the stroke module instead.

## Charter contradictions

- **Decision #1 (closed switch in bounds/fill) is partially superseded.** The charter records "[2026-07-02] Closed `switch(key)` in bounds/fill is the intentional tight-loop exception." Bounds have since moved to an open registry (`registerShapeBoundsCommand`) per the 2026-08-13 status log. Fill resolution (`getShapeFillRegions`) and `hasNonSolidShapeFill` still use a closed switch on the command key, consistent with the charter. The bounds migration to a registry is a material design change that the charter's Decisions section has not been updated to reflect. Recommend updating or superseding Decision #1 to record the registry architecture for bounds.

- **Decision #4 ("Shape should depend on `@flighthq/path`") is now implemented.** `package.json` declares `@flighthq/path` as a dependency. `morphShape.ts` imports `createPath` and `samplePathMorph`; `compactStrokePath.ts` imports `appendPathClose`. The KAPPA constant divergence is resolved: both `shapeFill.ts` and `path.ts` import `CIRCLE_KAPPA` from `@flighthq/math/contract`. The charter decision is satisfied.

- Decisions #2 (stroke-to-geometry delegated to path), #3 (shape-formats neighbor), and #5 (keep loose buffer) are upheld. No other contradictions.

## Contract & docs fit

**Satisfies the contract well:** full unabbreviated names (`appendShapeBeginGradientFill`, `computeShapeLocalBoundsRectangle`, `getShapeStrokeOutlineRegions`); `out`-first bounds; null sentinels (`getShapeFillRegions`, `getShapeStrokeRegions`, `getShapeStrokeOutlineRegions`); types-first homing in `@flighthq/types`; two export lanes; `sideEffects: false`; opt-in registration for bounds and bounds guards; invalidation uniformly through `invalidateContent` from `@flighthq/node/contract`; `explain*` diagnostics for bounds, tessellation, and morph-shape gradient endpoints.

**Observations:**

- The bounds-registry architecture aligns with the codebase convention of open registries over closed switch unions and is a good fit for extensibility (custom backend commands can register their own bounds contributions). However, this is a shift from the charter's Decision #1 that should be recorded.
- `@flighthq/geometry` is a runtime dependency used by `morphShapePaint.ts` (`cloneMatrix`, `createMatrix`) -- correctly declared in `package.json` as a dependency.
- `@flighthq/animation` is a runtime dependency used by `morphShapeAnimation.ts` (`sampleAnimationClip`) -- correctly declared.
- Module-scoped mutable state (`_commands` map in `shapeBoundsRegistry.ts`, `_shapeBoundsGuard` in `shapeBounds.ts`, `_remappedPathData` in `scale9ShapeCommands.ts`) is process-level policy state, consistent with the Flight registry pattern. The bounds registry comment documents this rationale.

## Candidate open directions

1. **Register `drawTriangles` in the default bounds commands.** `defaultShapeBoundsExpandPointPairs` already exists as a vertex-sweep handler. Registering it for `drawTriangles` in `registerDefaultShapeBoundsCommands` would close the last vocabulary/bounds gap and make bounds complete for all default Shape commands.
2. **Consolidate duplicated private functions.** `isShapeGeometryCommand` and `hasNonSolidShapeStroke` are duplicated between `shapeStroke.ts` and `shapeStrokeOutline.ts`. Extract to a shared internal or export from `shapeStroke.ts` and import in `shapeStrokeOutline.ts`.
3. **Update charter Decision #1.** Record the bounds-registry migration and the current split: fill/non-solid queries use closed switches (small, stable family), bounds use an open registry (extensible by backends).
4. **Pen-state home for `appendShapeArcTo`.** The per-call O(n) buffer rescan wants a runtime pen slot or explicit pen parameter.
5. **Backfill test depth.** Stroke outline and compact-stroke-path test coverage is minimal (2 tests each). `drawPath`-winding-carry and `drawTriangles`-with-uvtData are untested in the fill module.
6. Standing charter items: scale-9 feature-or-field (#1), robustness policy (#3), Rust crate (#4) -- unchanged.
