---
package: '@flighthq/scene2d-gl'
status: solid
score: 82
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - assessment.md
  - source
  - types
---

# Review: @flighthq/scene2d-gl

## Verdict

solid -- 82/100. The package delivers the full WebGL2 leaf-renderer suite for the 2D display-object family: twelve registered kinds, a material/shader system with a color-adjustment fold that promotes batches without splitting them, scissor and stencil clipping, render-to-FBO caching, and a velocity rasterization pass. The recent `scene2dGlPipeline` const provides a turnkey one-value wiring path that carries all standard renderers, blend modes, texture resolvers, the standard material, and the stroke tessellator into a single `GlPipeline` value. Test coverage is complete (29 colocated test files for 30 source files, the missing one being the convention-excluded `glTestHelper.ts`). The cross-package test-helper coupling that the prior review flagged as a blocker is resolved.

The score sits below the prior assessment's 84 after source-verified deductions for: (a) three shader pairs that still use WebGL1-era GLSL (`attribute`/`gl_FragColor`) without `#version 300 es`, contradicting the status log's claim that this was upgraded, while sibling shaders in the same package use `#version 300 es`; (b) per-call `new Float32Array` allocations in hot-path functions (`shapeMeshMatrix`, `getProjectionMat3`); (c) the standing Canvas2D raster dependency for gradient fills, texture fills, strokes, and all text; and (d) a module-scoped mutable `let` for the text-input overlay that departs from the explicit-dependency model.

This is a full re-review against source, not a delta review. Every claim below is verified against the live tree.

## Present capabilities

### Leaf renderers (twelve kinds, all registered)

`scene2dGlPipeline` (`scene2dGlPipeline.ts`) registers all twelve built-in kinds through `buildScene2dGlRenderers` using the `withRegistryTableEntry` API from `@flighthq/registry`:

| Kind | Source file | Draw path |
| --- | --- | --- |
| `BitmapTextKind` | `glBitmapText.ts` | Quad-batch instanced (one draw per atlas page) |
| `DisplayObjectKind` | `glNode2D.ts` | No-op (container passthrough) |
| `MorphShapeKind` | `glShape.ts` | Shared with ShapeKind (same renderer descriptor) |
| `ParticleEmitter2DKind` | `glParticleEmitter2D.ts` | Dedicated instanced shader, independent flush |
| `QuadBatchKind` | `glQuadBatch.ts` | Quad-batch instanced (per-instance transforms) |
| `RenderCacheKind` | `glCache.ts` | FBO composite quad |
| `RichTextKind` | `glRichText.ts` | Canvas2D raster, texture upload, immediate quad |
| `Scale9ShapeKind` | `glScale9Shape.ts` | Canvas2D raster with scale-9 command remapping |
| `ShapeKind` | `glShape.ts` | Hybrid: tessellated mesh first, canvas raster fallback |
| `SpriteKind` | `glSprite.ts` | Quad-batch instanced |
| `TextLabelKind` | `glTextLabel.ts` | Canvas2D raster, texture upload, quad-batch |
| `TilemapKind` | `glTilemap.ts` | Quad-batch instanced (tiles as instances) |

All renderers are opt-in via `register*` functions or the pipeline const. No module-top-level registration occurs. `"sideEffects": false` is declared in `package.json`.

### Quad-batch writer (`glQuadBatchWriter.ts`)

The central batching engine. Uses `#version 300 es` instanced rendering with a fixed 13-float-per-instance layout (transform + size + UV + alpha). Batch-breaking is keyed on texture, sampler, blend mode, material, and smoothing. Dynamic buffer growth doubles capacity. Shared by Sprite, QuadBatch, Tilemap, BitmapText, TextLabel, and raster Shape renderers.

### Color-adjustment material feature (`glColorAdjustmentMaterialFeature.ts`)

Opt-in via `registerGlColorAdjustmentMaterialFeature`. Implements a five-mode promotion ladder (NONE -> UNIFORM -> PACKED_TINT -> PER_INSTANCE -> MATRIX) that never splits a batch. The packed-tint path uses 4-byte RGBA8 per instance; the full path uses 8 or 20 floats per instance. Shape mesh tinting is handled through uniform-only scale/bias and full color-matrix shaders. Tree-shakeable: the lean base shader carries none of this code when the feature is not enabled.

### Clipping (`glClip.ts`, `glClipRectangle.ts`, `glClipContours.ts`)

Unified clip hooks installed via `enableGlClipSupport`. Rectangle clips use the GL scissor test with a stack and intersection. Contour clips use stencil-then-cover with non-zero or even-odd winding. The two compose (AND together when nested). Masks are retired; the former mask is now a path ClipRegion.

### Render-to-FBO caching (`glCache.ts`)

`createGlCacheState` creates an offscreen render state sharing the screen state's GL context. `refreshGlRenderCache` bakes a subtree into an FBO target, driven by the scene graph's dirtiness. `destroyGlRenderTarget` deterministically frees GPU resources. Teardown is registered on the owner state so resources are cleaned up.

### Velocity rasterization (`glVelocity.ts`)

`renderGlVelocity` writes per-node and per-instance motion vectors into an rgba16f render target. Three built-in writers: `defaultGlNode2DVelocityWriter` (display-object world bounds), `defaultGlParticleEmitter2DVelocityWriter` (per-particle), `defaultGlQuadBatchVelocityWriter` (per-instance or coarse fallback). Uses an open registry (`registerGlVelocityWriter`) -- the only family in the package already on the registry-dispatched pattern. Context state (BLEND, viewport, clear color) is fully saved and restored -- a prior leak was fixed and is documented in `status.md`.

### Shape rendering strategies

Three strategies share one `GlShapeRendererData` cache:

1. **`defaultGlShapeRenderer`** (hybrid) -- tessellates solid fills through `@flighthq/path`, falls back to canvas raster for gradient/texture fills and closed strokes. Pulls both paths into the bundle.
2. **`defaultGlMeshShapeRenderer`** (GPU-only) -- tessellates everything; untessellatable fills do not draw. Leaves `@flighthq/scene2d-canvas` out of the bundle.
3. **`defaultGlRasterShapeRenderer`** (canvas-only) -- replays the entire command stream to a canvas. Leaves `@flighthq/path` tessellation out of the bundle.

`enableGlStrokePathTessellation` opts in the closed-ring stroke tessellator from `@flighthq/path`.

### Turnkey pipeline (`scene2dGlPipeline.ts`)

A `const scene2dGlPipeline: GlPipeline` carrying all twelve standard renderers, the standard material, standard blend realizations, standard texture resolvers, and the stroke tessellator. Created at module scope but is a frozen value, not a side effect. Well-tested (seven assertions covering renderer count, kind coverage, blend realizations, texture resolvers, stroke tessellator, material renderer, and Entity identity).

### Diagnostics

`explainGlScene2DCoverage` and `hasGlScene2DCoverage` compose the shared `explainScene2DCoverage` with GL-specific blend-realization and material-renderer checks. `enableGlColorAdjustmentGuards` installs a shakeable guard that warns (via `@flighthq/log`) when a color adjustment is present but the feature is not enabled. `getGlShapeRasterizer` returns null (sentinel) for a missing rasterizer; the caller reports via `registryMiss`.

### Test helper

`glTestHelper.ts` builds state through render-gl's public `createGlRenderState` API. Not exported from the barrel (excluded by the `*testhelper.ts` convention). All 29 test files import locally.

## Gaps

### GLSL version inconsistency (three shader pairs on WebGL1 GLSL)

The quad-batch, particle, velocity, and color-adjustment batched shaders use `#version 300 es` with `in`/`out`/`layout(location=N)` and `fragColor`. Three shader pairs do not:

- `glShapeMesh.ts` VERTEX_SOURCE/FRAGMENT_SOURCE -- `attribute`, `gl_FragColor`, no version directive
- `glClipContours.ts` VERTEX_SOURCE/FRAGMENT_SOURCE -- same
- `glColorAdjustmentMaterialFeature.ts` SHAPE_MESH_CT_VS, SHAPE_MESH_CT_FS, SHAPE_MESH_MATRIX_FS -- same

WebGL2 contexts accept WebGL1 GLSL, so this is not a runtime error, but the inconsistency within one package contradicts the status log entry (2026-06-24) claiming the upgrade was done. These shaders should be brought to `#version 300 es` for consistency and to match the charter's "WebGL2 (`#version 300 es`)" boundary.

### Per-call Float32Array allocations in hot paths

`shapeMeshMatrix` (`glShapeMesh.ts:136`) allocates a `new Float32Array([...])` on every call -- once per shape mesh draw. The status log (2026-06-24) claims this was moved to module-scope scratch; the current code shows otherwise. `getProjectionMat3` (`glClipContours.ts:176`) similarly allocates a `new Float32Array` per call. Both should use a module-scope scratch array (the pattern the velocity and cache files already use with `_scratchVelocity`, `_bounds`, etc.).

### Canvas2D raster dependency

Gradient fills, texture fills, all strokes (unless `enableGlStrokePathTessellation` is called), and all text (TextLabel, RichText) rasterize through an offscreen Canvas2D and upload as a texture. `@flighthq/scene2d-canvas` is a runtime dependency in `package.json`, and `contract.ts` re-exports sixteen `defaultCanvas*` commands under `defaultGl*` names. This is the package's standing fidelity ceiling, acknowledged in charter and status.

### No context-loss recovery

No code in the package handles `webglcontextlost` or `webglcontextrestored`. Shader caches (`_velocityPrograms`, `clipPrograms`, `shapeMeshPrograms` via `runtime.context.shapeMeshResources`) are keyed per `WebGL2RenderingContext` and are never rebuilt. A lost context is unrecoverable without full state recreation.

### Texture cache has no eviction

`GlRenderState.textureCache` is a `WeakMap` with manual `deleteTexture` in per-node `destroyData` functions. No budget, LRU, or size limit. VRAM is released only when the source image is GC'd or the node is destroyed. Acknowledged in the charter as an open cross-package design fork.

### No GL render stats

`scene2d-wgpu` carries `wgpuRenderStats.ts`; this package has no counterpart. Draw-call counts and instance counts are unobservable.

### Text is rasterized, not atlased

`glTextLabel.ts` and `glRichText.ts` upload one texture per label. `@flighthq/glyphatlas` is not consumed by any source file here. SDF/MSDF text is not implemented, gated on the `@flighthq/text-shaping` seam.

### Every tessellated mesh is its own draw call

`glShapeMesh.ts:55-64` calls `bufferData(STREAM_DRAW)` + `drawElements` per mesh per frame. No persistent vertex/index buffer, no batching of same-program meshes across shapes.

### Module-scoped mutable `let` for text-input overlay

`glRichText.ts:230` declares `let _webglTextInputOverlay: GlRichTextOverlay | null = null`, set by `registerGlTextInputOverlay` and read during `drawGlRichText`. This is module-scoped mutable state reachable by a function without it being passed as an argument -- a departure from the explicit-dependency model. The pattern is isolated (only one callsite reads it), but it is the only `let` module variable in the package that carries behavioral state rather than scratch/cache data.

### `remapGlScale9Commands(unknown[])` loose signature

`_remappedCommands` in `glScale9Shape.ts` is typed as `ShapeCommandToken[]`, but the underlying `ShapeData.commands` is `unknown[]` codebase-wide. Tightening this alone would be inconsistent; it is a codebase-wide command-buffer-type decision.

## Charter contradictions

1. **GLSL version claim.** The charter boundary says "WebGL2 (`#version 300 es`) leaf renderers." Three shader pairs in the package emit WebGL1-era GLSL without a version directive. They compile on a WebGL2 context but do not satisfy the stated boundary.

2. **Status log accuracy on `shapeMeshMatrix` scratch.** The status log entry (2026-06-24) claims `shapeMeshMatrix` was moved to a module-scope `Float32Array(9)` scratch. The live code allocates a `new Float32Array` on every call. The log entry is stale.

3. **No contradiction on shape command borrowing.** The charter explicitly names this as an undecided boundary question, and the code matches: `contract.ts` re-exports from `@flighthq/scene2d-canvas/contract` under aliased names.

4. **Registry dispatch aligns with charter.** Velocity writers use an open registry (confirmed: `registerGlVelocityWriter`). Renderers dispatch through `withRegistryTableEntry`. The color-adjustment feature uses a slot table. No closed `switch(kind)` exists on a hot path.

5. **`scene2dGlPipeline` and the registration story.** The charter's open direction asks whether a turnkey registrar should be blessed. The pipeline const is a different approach (data, not a `registerAll` function) and is already implemented and tested, but the charter has not recorded a decision.

## Contract & docs fit

**Export lanes.** Two blessed lanes: `.` (index.ts, cultivated public API) and `./contract` (contract.ts, full surface for intra-SDK). Verified in `package.json` exports. `glTestHelper.ts` is excluded from the barrel.

**Types home.** No exported `interface`, `type`, or `enum` is defined in this package. All types are imported from `@flighthq/types/contract`. Internal interfaces (`GlScale9ShapeData`, `GlRichTextData`, `GlTextLabelData`, `ClipProgram`, `GlVelocityProgram`) are file-private.

**Side effects.** `"sideEffects": false` declared. No module-top-level registration, timer, or listener. `scene2dGlPipeline` is a const created at module scope, but it is a frozen data value, not a side effect -- callers must explicitly pass it to a render state. The `_webglTextInputOverlay` `let` is a minor departure (see Gaps) but does not fire on import.

**Naming.** All exported functions use the `gl`-prefix and full, unabbreviated type names (`drawGlSprite`, `registerGlVelocityWriter`, `enableGlStrokePathTessellation`). Globally self-identifying without context.

**Allocation.** `create*` functions allocate (confirmed: `createGlCacheState`, `createGlVelocityTarget`, `createGlShapeData`, `createGlScale9ShapeData`, `createGlRichTextData`, `createGlTextLabelData`). `destroy*` frees GPU resources deterministically (confirmed: `destroyGlShapeData`, `destroyGlScale9ShapeData`, `destroyGlRichTextData`, `destroyGlTextLabelData`). Scratch objects (`_bounds`, `_scratchVelocity`, `_renderTransform`, `_identity`, `_targetSize`) are at file bottom after exports. Exception: the `Float32Array` allocations in `shapeMeshMatrix` and `getProjectionMat3` violate the no-allocation-in-hot-loops principle.

**Diagnostics.** `enableGlColorAdjustmentGuards` installs a shakeable guard emitting through `@flighthq/log`. `explainGlScene2DCoverage` returns plain data. `registryMiss` reports sentinel failures. Aligns with the diagnostics convention (inversion rule: seams in core, messages in guard modules).

**Import type separation.** All `import type` statements are on separate lines from value imports throughout the package. Verified across all source files.

**`as unknown as` casts.** The status doc flags `as unknown as` casts in `glScale9Shape.ts`, `glRichText.ts`, `glShapeData.ts`, `glTextLabel.ts`. In the current source, `glShapeData.ts:54` uses a plain `as GlShapeRendererData` cast (narrower than double-cast), `glTextLabel.ts:45` uses `as GlTextLabelData`, `glRichText.ts:49` uses `as GlRichTextData`, and `glScale9Shape.ts:170` uses `as GlScale9ShapeData`. These are single-level `as` casts on `RendererData`, not `as unknown as` -- the status doc's claim of double casts is stale. The remaining `as unknown as` casts are in `glVelocity.ts`, where they narrow a generic `Transform2DNode<Traits>` to concrete node types -- justified by the generic signature and not the same renderer-data pattern.

**Dependencies.** `package.json` lists 19 runtime dependencies, all `@flighthq/*` workspace packages. `@flighthq/scene2d-canvas` is among them (the shape-command borrowing). Dev dependencies are 4 packages (`bitmaptext`, `particleemitter`, `quadbatch`, `tilemap`) used only in tests.

## Candidate open directions

These are observations, not recommendations. Each requires a charter decision or cross-package coordination.

- **Upgrade three shader pairs to `#version 300 es`.** The shape-mesh, clip-contours, and shape-mesh color-adjustment shaders use WebGL1-era GLSL. Straightforward within-package work, no API change, aligns with charter boundary.
- **Hoist `shapeMeshMatrix` and `getProjectionMat3` allocations to module-scope scratch.** Two `Float32Array` allocations per draw call in hot-path functions. The pattern (module-scope scratch array) is already established in `glCache.ts` and `glVelocity.ts`.
- **Resolve the `scene2dGlPipeline` vs `registerGlDisplayObjectRenderers` registration story.** The pipeline const exists and is tested; the charter still asks whether a turnkey registrar should be blessed. A one-line decision.
- **Native GPU gradient fills, stroke tessellation, bitmap fills, and SDF text** -- the standing fidelity arc, gated on the North-star decision and cross-package seams.
- **Texture-cache eviction policy** -- cross-package (`types` + `render-gl`).
- **Context-loss recovery** -- no code exists; requires design work.
- **GL render stats** -- counterpart to `wgpuRenderStats.ts`.
- **Shape-mesh batching** -- each mesh is its own draw call with a fresh upload.
- **`_webglTextInputOverlay` module-scoped mutable state** -- could be moved to a render-state registry slot to match the explicit-dependency model.
