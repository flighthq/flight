# Depth Review: @flighthq/clip

**Domain**: Geometric clipping / masking regions — the data primitive describing a hard, transform-exact clip (axis-aligned rectangle scissor or arbitrary flattened-path stencil-then-cover) that constrains a node and its subtree to a region.

**Verdict**: partial — 45/100

The package is a single, well-conceived data-producer file (`clipRegion.ts`, 3 exports) over the `ClipRegion` type defined in `@flighthq/types`. It is deliberately a thin "clip product" cell: it builds the descriptor; the renderer backends (`displayobject-canvas/-dom/-gl/-wgpu`) realize it, and the render core (`updateNodeClip`) plumbs it. Judged purely as the clip-region domain owner — the place a developer expects the canonical vocabulary of clipping operations to live — it covers the construction half and omits the operational half (composition, intersection, query, transform) that a mature clip/region library provides.

## Present capabilities

- `createClipRegionFromRectangle(rectangle)` — the allocation-light, scissor-eligible rectangle form. Correctly clones the rectangle so later caller mutation does not leak into the region; `contours: null`, `winding: 'nonZero'`, `version: 0`.
- `createClipRegionFromPath(path, tolerance = 0.25)` — flattens an arbitrary `Path` to contours via `@flighthq/path` `flattenPath`, derives the bounding `rect` for culling / cover quad, and carries the path's own `winding` rule. Supports concavity, holes, and self-intersection by deferring to stencil-then-cover at render time. The tolerance parameter is a reasonable flattening knob.
- `invalidateClipRegion(clip)` — version bump (`(v+1) >>> 0`) mirroring the texture/resource invalidation convention, so backends re-derive cached state.
- Clean separation of concerns: the `ClipRegion` interface, its two-form discriminated shape (rect vs contours), and the `HasClip` trait all live in `@flighthq/types` (the header layer), correctly. The package is `sideEffects: false` and value-typed — exactly the mixable leaf shape the architecture wants.
- Internal `setRectangleToContoursBounds` handles the empty-contour degenerate case (collapses to a zero rect).

## Gaps vs an authoritative clipping/region library

An authoritative region/clip library is more than two constructors. The notable omissions, by category:

- **Boolean composition (the core of any region library).** There is no intersection, union, subtract, or XOR of two clip regions. Nested clipping (the common case: a clipped node inside a clipped subtree) is the single most important clip operation, and there is no `intersectClipRegions(out, a, b)` / `combineClipRegions`. Today the render layer must intersect clips ad hoc per backend; the domain owner should provide the canonical operation. This is the largest gap and is _by omission_, not by design — the architecture (out-params, value types) accommodates it directly.
- **Containment / hit queries.** No `clipRegionContainsPoint(clip, x, y)`, `clipRegionContainsRectangle`, or `clipRegionIntersectsRectangle`. Hit-testing and culling against a clip are canonical region operations; consumers (interaction, culling) currently have nothing to call.
- **Transform application.** No `transformClipRegion(out, clip, matrix)` to bake a clip into a different space. The contours are stored "in clip-local space" and every backend re-applies the world transform independently; a shared transform helper (and a transformed-bounds helper) is expected domain surface.
- **Bounds / measurement accessors.** No `getClipRegionBounds`, no `isClipRegionEmpty`, no `isClipRegionRectangular` (the rect-vs-contour discriminator is read by hand via `contours === null` at every callsite). At minimum the rect/contour discrimination and emptiness should have named predicates.
- **Equality / change detection beyond the version counter.** No `clipRegionsEqual`. `version` is a manual stamp the caller must remember to bump; there is no structural comparison for cache reuse.
- **Additional constructors.** No `createClipRegionFromContours` (raw contour input without a `Path`), no `cloneClipRegion`, no `copyClipRegion`/`setClipRegionToRectangle` mutator forms, and no rounded-rect / ellipse / circle conveniences. For a tree-shakable value type, `clone*` and a `set*` mutator are conventional and currently absent.
- **Even-odd vs non-zero is carried but never exercised here.** Winding is plumbed through, which is good, but there is no helper to construct or normalize it; correctness lives entirely in backends.

What is reasonably **out of scope by design** (correctly absent here): actual rasterization (scissor/stencil) lives in the `*-clip` backend modules; soft/feathered masking is explicitly delegated to `MatteFilter`; the per-node trait wiring lives in `@flighthq/node` (`initClipTrait`) and `@flighthq/displayobject` (`setDisplayObjectClip`). None of those belong in this leaf.

## Naming / API-shape notes

- The three names are exact, self-identifying, and follow house style (`createClipRegionFrom*`, `invalidateClipRegion`). The `From<Source>` constructor pattern is good and signals the extension path for the missing `FromContours` form.
- `invalidateClipRegion` correctly mirrors `invalidateImageResource`, keeping the version-stamp idiom consistent across the SDK.
- The package description ("hard geometric clip product built from rectangles or paths") is accurate but advertises a _product_, not a _library_ — consistent with the thin scope, but the domain name `clip` sets an expectation of the fuller operation set above.
- Missing operations would all slot in cleanly with the established out-param convention (`intersectClipRegions(out, a, b)`, `transformClipRegion(out, clip, matrix)`), so the API shape is ready to grow; nothing about the current design blocks reaching authoritative depth.

## Recommendation

Treat the package as a correct but unfinished cell and bring it to AAA depth by adding the operational half. Priority order:

1. **Boolean composition** — at least `intersectClipRegions(out, a, b)` (rectangle∩rectangle fast path → scissor; otherwise contour intersection), since nested clipping is the defining real-world need. This is the gap that most justifies the package existing as a domain owner rather than two helper functions.
2. **Queries** — `clipRegionContainsPoint`, `clipRegionIntersectsRectangle`, `getClipRegionBounds`, `isClipRegionEmpty`, `isClipRegionRectangular`.
3. **Transform + clone** — `transformClipRegion(out, clip, matrix)`, `cloneClipRegion`, and a `createClipRegionFromContours` constructor.
4. Optionally `clipRegionsEqual` for structural cache reuse, and rounded-rect/ellipse convenience constructors.

Until composition and queries exist, this is a solid foundation but a partial library: it can _describe_ a clip but cannot _operate_ on one.
