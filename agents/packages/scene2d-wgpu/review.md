---
package: '@flighthq/scene2d-wgpu'
status: solid
score: 92
updated: 2026-09-02
ingested:
  - status.md
  - source
  - charter.md
  - assessment.md
---

# scene2d-wgpu — Review

## Verdict

`solid -- 92/100`. A well-structured WebGPU leaf-renderer package covering 12 display-object kinds across sprite batching, tessellated-mesh shapes, stencil/scissor clipping, render-cache targets, color-transform materials, velocity-field writers, and text rendering. The package boundary is clean: GPU plumbing stays in `render-wgpu`, backend-agnostic registration stays in `render`, and this package contributes only per-subject draw logic.

Since the prior review (2026-08-25, score 94), the blend-mode surface has expanded from Normal + Add to the full fixed-function set (Normal, Add, Multiply, Screen, Darken, Lighten) -- realized in `render-wgpu`'s `getWgpuBlendState` and consumed here through pipeline-keyed dispatch. The prior review's "Normal + Add only" gap is now closed for the fixed-function tier. Several status-documented gaps remain (color-matrix on shape meshes, stats surface unwired, no coverage query, raster-only text, borrowed shape commands), all externally gated and accurately reported. Score lowered from 94 to 92 to correct for the prior review's false video-renderer claim and the continued absence of stats wiring.

The prior review listed "video" as a present capability with a `defaultWgpuVideoRenderer`. No `wgpuVideo.ts` exists in `src/`, `VideoKind` is not defined in `@flighthq/types`, and `scene2dWgpuPipeline.ts` registers no video kind. Video rendering is not a capability of this package.

## Present capabilities

Verified against `packages/scene2d-wgpu/src/` on 2026-09-02.

- **12 display-object kinds registered** in `scene2dWgpuPipeline.ts`: BitmapText, DisplayObject, MorphShape, ParticleEmitter2D, QuadBatch, RenderCache, RichText, Scale9Shape, Shape, Sprite, TextLabel, Tilemap. Plus StandardMaterialKind as a material renderer. No video kind.

- **Sprite / quad-batch instancing** (`wgpuQuadBatchWriter.ts`, 465 lines -- the largest module). 13-float per-instance layout, pipeline caching keyed by `blendMode-stencilMode-format`, a per-frame buffer pool (`resetWgpuQuadBatchWriterBufferPool`), material-instance packing, and a WGSL prelude (`getWgpuQuadBatchPreludeWGSL` -- `struct InstanceData` + `fn quadBaseVertex`). Material shaders build on the prelude by appending their own `@group(3)` buffer, VertexOut, vs_main, and fs_main.

- **Full fixed-function blend-mode coverage.** `render-wgpu`'s `BLEND_MODES` table maps all six `BlendMode` members (Normal, Add, Multiply, Screen, Darken, Lighten) to `GPUBlendState` values. The quad-batch pipeline (`getWgpuQuadBatchPipeline`) and shape-mesh pipeline (`ensureShapeMeshPipeline`) both call `getWgpuBlendState(blendMode)`, so every fixed-function mode now produces a correct pipeline. Advanced (destination-reading) modes are explicitly a `BlendEffect`, not a `BlendMode`.

- **Shape rendering** -- three strategies:
  - `defaultWgpuShapeRenderer` (hybrid): tries tessellated mesh first, falls through to canvas rasterization. Pulls both paths into the bundle.
  - `defaultWgpuMeshShapeRenderer` (GPU-only): tessellates only; shapes with gradient/texture fills or closed strokes do not draw. Leaves `@flighthq/scene2d-canvas` out of the bundle.
  - `defaultWgpuRasterShapeRenderer` (canvas-only): replays the full command stream into an offscreen canvas. Leaves `@flighthq/path` out of the bundle.
  Shape commands are re-exported from `@flighthq/scene2d-canvas` under `defaultWgpu*` aliases (`contract.ts:32-48`); the command IR is shared, not authored here.

- **Tessellated-mesh shape rendering** (`wgpuShapeMesh.ts`): flat-color WGSL pipeline, per-mesh vertex/index buffer upload via `queue.writeBuffer`, stencil-gated by contour clip depth. Color-adjustment fold for `ColorScaleBias` through the opt-in `drawWgpuShapeMeshesColorScaleBias` path in `wgpuColorAdjustmentMaterialFeature.ts`.

- **Clipping subsystem** (`wgpuClip.ts`, `wgpuClipRectangle.ts`, `wgpuClipContours.ts`): opt-in via `enableWgpuClipSupport`. Rectangle clips use GPU scissor; contour clips use stencil increment/decrement. Nested clips AND correctly. `clipForms` stack tracks the form of each pushed clip for correct unwind.

- **Render cache** (`wgpuCache.ts`): off-screen target lifecycle. `createWgpuCacheState` creates an offscreen render state sharing the owner's device. `refreshWgpuRenderCache` bakes a subtree into a target using `withWgpuFrameBorrow`. `releaseWgpuRenderCache` destroys GPU textures. Allocation verb bracket is correct: `ensure*` is idempotent-get, `release*` frees GPU resources.

- **Color-transform materials** (`wgpuColorAdjustmentMaterialFeature.ts`, 760 lines): the opt-in per-instance color-adjustment fold. Five modes (NONE, UNIFORM, PACKED_TINT, PER_INSTANCE, MATRIX) adaptively promote as instances accumulate. Packed tint uses `unpack4x8unorm` for a single `u32` per instance; full scale/bias uses 8 floats; full matrix uses 20 floats. Three WGSL module variants are lazily compiled per device. The shape-mesh path has its own color-scale-bias pipeline (`SHAPE_MESH_COLOR_SCALE_BIAS_WGSL`).

- **Velocity-field writers** (`wgpuVelocity.ts`): per-state open registry (`registerWgpuVelocityWriter` / `getWgpuVelocityWriter` over `WgpuRenderStateRuntime.registries.velocityWriters`). Three default writers: `defaultWgpuNode2DVelocityWriter` (world-bounds coverage), `defaultWgpuParticleEmitter2DVelocityWriter` (per-particle), `defaultWgpuQuadBatchVelocityWriter` (per-instance). `renderWgpuVelocity` walks the scene tree and dispatches per kind. Registry shape satisfies fork B.

- **Text rendering** (`wgpuTextLabel.ts`, `wgpuRichText.ts`): canvas-rasterized, uploaded as a texture per label/field. Content-version-driven re-rasterization. RichText supports scrolling, background, border, underline, strikethrough, and a registerable text-input overlay seam (`registerWgpuTextInputOverlay`).

- **BitmapText** (`wgpuBitmapText.ts`): per-glyph batched sprite rendering through the quad-batch writer. One flush per atlas page. Color adjustment folds per-node.

- **Diagnostics seam** (`enableWgpuColorAdjustmentGuards.ts`): shakeable guard that warns via `@flighthq/log` when a node carries a color adjustment but `registerWgpuColorAdjustmentMaterialFeature` was not called. The guard is separately imported and never linked into the production path unless the caller opts in. Satisfies the diagnostics convention.

- **Typed renderer-data helpers** (`wgpuRendererData.ts`): `createWgpuRendererData<T>` and `getWgpuRendererData<T>` eliminate repeated `as unknown as` double casts from renderer implementations. Used in `wgpuTextLabel.ts`, `wgpuRichText.ts`, `wgpuScale9Shape.ts`, `wgpuShapeData.ts`. The remaining `as unknown as` casts (`wgpuVelocity.ts`) are graph-feature trait casts, a different concern.

- **Render stats surface** (`wgpuRenderStats.ts`): `getWgpuRenderStats`, `resetWgpuRenderStats`, `recordWgpuBatchFlush`, `recordWgpuTextureUpload`. WeakMap-backed, no-op-before-init. Type `WgpuRenderStats` homed in `@flighthq/types`.

- **Pipeline preset** (`scene2dWgpuPipeline.ts`): pre-built `WgpuPipeline` with all 12 kind renderers and the standard material, ready for `createWgpuRenderState`. Not behind a `register*` function -- it is a data constant, not a mutation.

- **Packaging shape**: `"sideEffects": false`. Two export lanes (`.` and `./contract`). No top-level `registerRenderer` -- all registration behind explicit `register*` / `enable*` functions. `index.ts` curates 36 public exports; `contract.ts` re-exports everything plus 16 `defaultWgpu*` command aliases from `@flighthq/scene2d-canvas/contract`.

- **Test coverage**: 29 test files colocated with 29 source modules. Only `scene2dWgpuPipeline.ts` (a data-construction module building a pipeline preset) lacks a test file. All other source files have 1:1 test coverage.

## Gaps

Each gap below is verified against source. Status-documented gaps are cited; newly identified gaps are marked.

- **Color-matrix adjustment silently dropped on tessellated meshes.** `drawWgpuShapeMeshes` (`wgpuShapeMesh.ts:107`) delegates to the color-adjustment fold only when `renderProxy.colorMatrix == null && renderProxy.colorScaleBias != null`. A full `colorMatrix` falls through to the lean path, which writes only `mesh.color * alpha` -- the color matrix is silently ignored. WebGL folds both cases. *(status-documented)*

- **Render-stats surface has zero callers.** `recordWgpuBatchFlush` and `recordWgpuTextureUpload` (`wgpuRenderStats.ts:16`, `:28`) are exported but invoked from nowhere in `packages/` -- not from `flushWgpuQuadBatchWriter`, not from `render-wgpu`'s texture upload. The counters always read zero unless an application instruments them by hand. *(status-documented; the prior review's "recordWgpuBatchFlush wiring is live" claim at wgpuSpriteBatch.ts line 200 is stale -- no file named `wgpuSpriteBatch.ts` exists in this package)*

- **No 2D coverage query.** `scene2d-gl` exports `explainGlScene2DCoverage` / `hasGlScene2DCoverage`. No wgpu twin exists. *(status-documented)*

- **Shape command vocabulary borrowed from Canvas.** `contract.ts:32-48` re-exports 16 `defaultCanvas*` commands under `defaultWgpu*` names. `@flighthq/scene2d-canvas` is a runtime dependency. Gradient and texture fills have no WGSL-native form. *(status-documented)*

- **Mesh shapes: one draw call per mesh per frame.** `wgpuShapeMesh.ts:76-92` re-writes per-mesh vertex and index buffers through `queue.writeBuffer` and issues one `drawIndexed` per mesh -- no persistent buffer, no merged batch. *(status-documented)*

- **Text is rasterized, not atlased.** `wgpuTextLabel.ts` and `wgpuRichText.ts` upload a texture per label. `@flighthq/glyphatlas` is not referenced. *(status-documented)*

- **No stats integration test.** The four stats functions are unit-tested in isolation, but no test exercises the `resetWgpuRenderStats` -> flush -> assert path. The wiring gap (stats having zero callers) makes this test currently impossible to write as more than a stub. *(status-documented)*

- **`scene2dWgpuPipeline.ts` has no test file.** It is a data-construction module that builds a preset `WgpuPipeline` by composing renderers. Reasonable to leave untested as a constant, but the composition (correct kinds, correct material) is verified only by manual inspection. *(new finding)*

- **Darken / Lighten blend modes are approximate under partial coverage.** The `render-wgpu` blend table comment notes that MIN/MAX do not distribute over coverage, so at zero alpha Darken wipes the backdrop to black. This is a shared GPU limitation (also present in `render-gl`), not a `scene2d-wgpu` defect, but users of these modes on translucent geometry will see artifacts. The faithful realization is through `AdvancedBlendMode.Darken/Lighten` as a `BlendEffect`. *(new finding -- informational, not actionable in this package)*

## Charter contradictions

The charter's North star, Boundaries, and Decisions sections are now populated (updated 2026-07-02). Verified against source:

- **"Full 2D display-object kind coverage on wgpu."** The pipeline registers 12 kinds. No `VideoKind` exists in the type system, so video is not a gap against the charter. The prior review's claim of a video renderer was incorrect.

- **"A leaf over the GPU core, not a GPU engine."** Satisfied. All GPU device/surface/shader/target plumbing is in `render-wgpu`. This package consumes `getWgpuRenderStateRuntime`, `getWgpuBlendState`, `createWgpuRenderTarget`, etc., without duplicating them.

- **"Registry over closed union (fork B)."** Satisfied. Velocity-writer subsystem uses a `Map`-keyed registry. Renderer registration uses the `render` framework's registry. Blend dispatch uses `getWgpuBlendState`, which is a lookup table over an open `string` type, not a closed switch. The color-adjustment feature registers through a slot table.

- **"Side-effect-free, single-root, opt-in."** `"sideEffects": false`, single `.` export, no top-level registration. All verified.

- **Decision: "No umbrella registerAll -- maximum tree-shaking."** `scene2dWgpuPipeline` is a data constant (a pre-built pipeline), not a `registerAll` function. Individual kind renderers are separately importable. Consistent.

- **Decision: "TS-leads, Rust conforms later."** No Rust crate exists yet. Consistent.

No contradictions found.

## Contract & docs fit

**(a) How well the package lives up to the codebase-map contract** -- strongly:

- **Types-first homing:** `WgpuRenderStats` is in `@flighthq/types`, not inline. No exported types are defined in this package. Correct.
- **Full, unabbreviated names:** every export carries the `Wgpu` + subject word (`registerWgpuColorAdjustmentMaterialFeature`, `drawWgpuShapeMeshBatch`, `getWgpuVelocityWriter`). No abbreviations.
- **Sentinels over throws:** `getWgpuVelocityWriter` returns `null`; `record*` functions no-op when uninitialized; `getWgpuRendererData` returns `null`; `getWgpuRenderCacheTarget` returns `null`. The one `throw` is in `renderWgpuVelocity` for "no active command encoder" -- a programmer-error precondition, correctly thrown.
- **Allocation verbs:** `create*` allocates (e.g., `createWgpuCacheState`, `createWgpuRendererData`, `createWgpuVelocityTarget`). `release*` frees (`releaseWgpuRenderCache`). `ensure*` is idempotent-get (`ensureWgpuQuadBatchResources`, `ensureWgpuRenderCacheTarget`). `acquire*` is a lazy bracket (`acquireWgpuShapeRasterSurface`). `destroy*` frees GPU resources (`destroyWgpuShapeData`). All correctly distinguished.
- **Registry over closed union:** velocity-writer registry, renderer registry, color-adjustment feature slot, shape-rasterizer slot -- all open registries.
- **Single root export, `sideEffects: false`, no top-level registration:** all verified.
- **Diagnostics inversion:** `enableWgpuColorAdjustmentGuards` is a separately-importable guard module emitting through `@flighthq/log`. Satisfies the convention.
- **`import type` separation:** all type imports use `import type { ... }` on their own lines. No inline `import { type Foo, bar }` patterns.
- **Loose module variables at bottom:** scratch arrays, WeakMaps, and module-scope state are placed after exported functions in every file inspected. Correct.

**(b) Where the contract / admin docs need revision:**

- **Prior review's "video renderer" claim is stale.** The prior review (2026-08-25) lists `defaultWgpuVideoRenderer` as a present capability and describes "defaultWgpuVideo" draw coverage. No video renderer exists. This review corrects the record.
- **Prior review's "recordWgpuBatchFlush wiring is live" claim is stale.** The prior review states "recordWgpuBatchFlush wiring is live: wgpuSpriteBatch.ts line 200 calls it." No file named `wgpuSpriteBatch.ts` exists. The status.md correctly identifies that `recordWgpuBatchFlush` has zero callers.
- **Prior review's blend-mode gap is now closed.** The prior review states "only NORMAL_BLEND and ADD_BLEND" and recommends updating `render-backend-support.md`. The `BlendMode` enum has exactly 6 members (Normal, Add, Multiply, Screen, Darken, Lighten) and `render-wgpu`'s `BLEND_MODES` table covers all 6. The fixed-function blend-mode gap is closed.

## Candidate open directions

The charter now has populated Open directions (2026-07-02). Updating against current source:

1. **Blend-mode boundary (charter direction #1) -- resolved in source.** The fixed-function `BlendMode` enum has 6 members, and `render-wgpu` maps all 6. The remaining blend gap is advanced (destination-reading) modes, which are explicitly a `BlendEffect` / `AdvancedBlendMode`, not a `BlendMode`. The charter direction can be closed: wgpu implements the full fixed-function set; advanced modes are a different subsystem. The Darken/Lighten partial-coverage caveat is shared with GL and documented in the blend table.

2. **Stats API status (charter direction #2).** `WgpuRenderStats` is homed in `@flighthq/types` and has zero callers. The question of whether stats should be backend-agnostic (`RenderStats` in `render`) or per-backend remains open. The `recordWgpuBatchFlush`/`recordWgpuTextureUpload` wiring gap makes this surface theoretical until a caller exists.

3. **Cross-backend register-all contract (charter direction #3).** `scene2dWgpuPipeline` is a data constant, not a `register*` function. `scene2d-gl` has no equivalent pipeline preset. Whether a symmetric pattern is blessed remains unresolved.

4. **GPU shape-fill home (charter direction #4).** Shapes are solid-fill mesh only on the GPU path. Gradient fills, texture fills, and closed strokes fall through to canvas rasterization. The shared tessellator / fill-descriptor design in `@flighthq/path` has not landed.

5. **Rust-crate parity (charter direction #5).** No Rust crate exists. Charter states TS-leads.

6. **Color-matrix support on shape meshes.** The `ColorScaleBias` fold on tessellated shapes is implemented, but a full `colorMatrix` (20-float) is silently dropped. The quad-batch path handles all three modes (packed tint, scale/bias, full matrix). Extending the shape-mesh pipeline to a `colorMatrix` variant is the within-package fix, but whether this should land before or alongside the cross-package shape-fill work is a sequencing question.

7. **Stats wiring.** `recordWgpuBatchFlush` belongs in `flushWgpuQuadBatchWriter` (this package) and `recordWgpuTextureUpload` belongs in `render-wgpu`'s upload path. The first is within-package; the second is cross-package.

8. **Coverage query.** Adding `explainWgpuScene2DCoverage` / `hasWgpuScene2DCoverage` for parity with `scene2d-gl` is within-package once the blend-mode and material-renderer coverage catalog types exist.
