# Depth Review: @flighthq/displayobject-wgpu

**Domain:** WebGPU per-subject leaf renderers for 2D display objects — the GPU backend that draws every display-object kind (bitmap, shape, sprite, tilemap, particles, text, video) into a `WgpuRenderState` over `render-wgpu`/`render`.

**Verdict: solid — 84/100**

This is a backend renderer cell, not a standalone domain library, and it should be judged against "does it render the full display-object family on WebGPU with the depth a mature GPU 2D backend needs?" Against that bar it is strong and near-complete: it has a real instanced sprite-batch pipeline, true GPU path tessellation for solid-fill shapes, an instanced particle shader, stencil-based vector clipping, offscreen render-cache targets, a material/shader seam, and a velocity-field pass. It tracks its WebGL sibling (`displayobject-gl`) almost file-for-file (24 of 25 source files have a direct twin). The gaps are real but are mostly inherited backend limitations (canvas-raster fallback for text/strokes/gradients, no glyph atlas, no MSAA control surfaced here) rather than missing display-object kinds.

## Present capabilities

Per-kind renderer objects (each a `DisplayObjectRenderer`/`SpriteRenderer` with `createData`/`destroyData`/`submit`, registered explicitly via `registerRenderer(state, FooKind, defaultWgpu*Renderer)`):

- **Bitmap** (`defaultWgpuBitmapRenderer`) — instanced quad with `sourceRectangle` UV sub-rect, per-node custom-shader escape hatch (`resolveWgpuShader` → flush + immediate draw), color-transform fast path (`drawWgpuColorTransformBitmap`).
- **Shape** (`defaultWgpuShapeRenderer`) — two-path: solid fills tessellate to colored GPU meshes via `tessellatePath` + `getShapeFillRegions` (crisp at any zoom, cached by content revision); gradients/bitmap-fills/strokes fall back to a per-node 2D canvas rasterized and uploaded as a texture. Shape-command registration mirrored from canvas (`registerWgpuShapeCommands`, the `defaultWgpu*` command re-exports).
- **Scale9** (`defaultWgpuScale9ShapeRenderer`, `buildWgpuScale9Mapper`, `remapWgpuScale9Commands`, `drawWgpuScale9ShapeMask`) — nine-slice shape remapping with a mask path.
- **Sprite / SpriteBatch / QuadBatch** (`defaultWgpuSpriteRenderer`, `flushWgpuSpriteBatch`, `prepareWgpuSpriteBatchWrite`, `ensureWgpuQuadBatchResources`, `getWgpuQuadBatchPipeline`, buffer-pool reset) — atlas-region instanced batching with per-instance material packing and a pipeline cache keyed by material/blend.
- **Tilemap** (`defaultWgpuTilemapRenderer`) — tile-atlas batch.
- **Particle emitter** (`defaultWgpuParticleEmitterRenderer`) — a genuine instanced WGSL shader (per-particle position, cos/sin·scale rotation, per-particle tint+alpha, atlas UV), not a canvas fallback.
- **Text** — `TextLabel` (single-format) and `RichText` (multi-format, with overlay hook for caret/selection) rasterized through `textlayout` to a DPR-aware canvas then uploaded; `TextInput` overlay registration (`enableWgpuTextInput`, `registerWgpuTextInputOverlay`, `drawWgpuTextInputOverlay`).
- **Video** (`defaultWgpuVideoRenderer`) — frame upload + draw.
- **Clipping** — both axis-aligned rectangle clip (`pushWgpuClipRectangle`/`popWgpuClipRectangle`) and arbitrary stencil contour clip with winding (`pushWgpuClipContours`/`popWgpuClipContours`), gated by `enableWgpuClipSupport`.
- **Render cache** — offscreen-target caching of subtrees (`enableWgpuRenderCache`, `createWgpuCacheState`, `ensureWgpuRenderCacheTarget`, `refreshWgpuRenderCache`, `releaseWgpuRenderCache`, `defaultWgpuRenderCacheRenderer`) using `copyAllRenderersFromRenderState`.
- **Materials/shaders** — default material shader (`registerDefaultWgpuMaterial`, the base sprite-batch WGSL), color-transform material + shader (`registerWgpuColorTransformMaterials`, `registerWgpuColorTransformShader`), and `getWgpuQuadBatchPreludeWGSL` for composing custom material WGSL.
- **Velocity field** — `renderWgpuVelocity` walks the scene dispatching per-kind `WgpuVelocityWriter`s into an `rgba16float` target (`createWgpuVelocityTarget`), with default writers for display objects, quad-batch, and per-particle emitters — the motion-vector input a motion-blur effect consumes.
- **Scene entry points** — `renderWgpuDisplayObject` (iterative stack walk, clip push/pop, batch flush) and `renderWgpuSprite`.

## Gaps vs an authoritative WebGPU 2D renderer library

- **Text is canvas-rastered, not GPU-shaped.** `TextLabel`/`RichText` measure and `fillText` into a 2D canvas, then upload one texture per text node. There is no glyph atlas, no SDF/MSDF text, no GPU glyph batching — so large or many text fields each cost a texture and re-raster on content change. This is the documented backend posture (the `text-shaping` seam and a full-glyph shaper are where real GPU text would come from), so it is **missing-by-design for now** rather than an omission, but an "authoritative" GPU text renderer would have an atlas path.
- **Strokes, gradient fills, and bitmap fills fall back to canvas raster.** Only solid fills take the true tessellation path; line styles and gradients route through `renderCanvasShapeCommands` → texture. A mature GPU vector renderer would tessellate strokes and shade gradients on-GPU. **Missing-by-design** (matches the GL backend), but it is the single biggest "depth" ceiling.
- **No MSAA / antialiasing control surfaced here.** Tessellated fills and stencil clips are aliased unless the surface itself is multisampled; there is no per-renderer AA configuration. (May live in `render-wgpu`; not exposed at this layer.)
- **No convenience "register all renderers" entry.** Every kind must be wired individually (`registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer)`, etc.). This is consistent with the project's explicit/tree-shakable philosophy (**by-design**), but it means the package ships building blocks, not a one-call setup.
- **Blend modes are delegated.** Blend handling is via `state.applyBlendMode`/the pipeline cache and `BlendMode` from `render-wgpu`; the advanced separable blend modes (overlay, hardlight, etc.) are not implemented or enumerated in this package — depth there depends on the core.
- **No per-renderer GPU profiling/diagnostics** (timestamp queries, draw-call counters) — expected of a top-tier engine backend but absent.

## Naming / API-shape notes

- Naming is consistent and self-identifying: `drawWgpu*`, `render Wgpu*`, `prepare/ensure/flush Wgpu*`, `push/popWgpuClip*`, `default Wgpu*Renderer`. The `Wgpu` infix on every export keeps the backend unambiguous and globally greppable, matching the `Gl`/`Canvas` siblings.
- The renderer objects follow the `DisplayObjectRenderer` contract (`format`/`createData`/`destroyData`/`submit`) cleanly; teardown uses `destroyData`/`destroy*` correctly for GPU textures and buffers (non-GC resources), honoring the `dispose` vs `destroy` rule.
- `RendererData` is repeatedly produced via `as unknown as RendererData` casts (shape/text/video data structs). This is an opaque-runtime-data idiom but leans on double casts in several files; a shared typed-data helper would read cleaner.
- The package re-exports the canvas shape-command set under `defaultWgpu*` aliases (`defaultWgpuBeginFill`, etc.) — pragmatic reuse of the canvas command layer, and a signal that the shape raster path genuinely shares canvas semantics.
- One asymmetry vs GL: GL has both `glColorTransformMaterial` and `glUniformColorTransformMaterial`; wgpu collapses to a single `wgpuColorTransformMaterial`. Reasonable, but worth confirming it is intentional and not a missing uniform-path variant.

## Recommendation

Treat as **solid and near-feature-complete for a 2D GPU backend cell** — accept it as-is for the current milestone. It renders the entire display-object family on WebGPU with real GPU pipelines where it matters (sprite/particle batching, solid-fill tessellation, stencil clipping, render-cache, velocity). To push toward "authoritative":

1. Add a GPU glyph-atlas text path (the highest-value depth gap) once the `text-shaping` seam lands, replacing the per-node canvas raster for `TextLabel`/`RichText`.
2. Move strokes and gradient fills onto GPU shading/tessellation to retire the canvas-raster fallback for shapes.
3. Surface MSAA/AA configuration and basic GPU diagnostics (draw-call/instance counts) at this layer.
4. Tidy the `as unknown as RendererData` casts behind a typed per-renderer data helper.

None of these block use; they are the difference between a strong backend and a definitive one. The canvas-raster fallbacks are explicitly the documented backend posture, so they are missing-by-design, not by omission.
