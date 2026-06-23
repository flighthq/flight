# Depth Review: @flighthq/displayobject-gl

**Domain:** WebGL2 leaf renderers for the 2D display-object family — the per-subject GPU backend that draws bitmaps, shapes, sprites/tilemaps/quad-batches, text, video, and particle emitters over the `render-gl` core, plus GPU clipping/masking, a material/shader system, render-to-texture caching, and a velocity (motion-vector) pass.

**Verdict:** solid — **78/100**

This is a genuinely deep, broad WebGL2 renderer suite, not a stub. It covers every display-object leaf type the Canvas backend covers, and adds GPU-only capabilities (instanced batching, GPU-tessellated crisp shape fills, stencil clipping, a velocity field pass, a material/shader registry) that have no Canvas equivalent. It falls short of "authoritative" mainly because several visual paths still defer to a hidden offscreen-Canvas2D raster (gradient/bitmap shape fills, strokes, text) rather than rendering natively on the GPU, which caps fidelity at Canvas resolution and undercuts the "WebGL renderer" promise for those cases.

## Present capabilities

Full leaf-renderer coverage (each an exported `DisplayObjectRenderer`/`SpriteRenderer` descriptor with `createData`/`submit`/`destroyData`, wired by the consumer via `registerRenderer`):

- **Bitmap** (`defaultGlBitmapRenderer`, `drawGlBitmap`) through the instanced sprite batch.
- **Shape** (`defaultGlShapeRenderer`, `drawGlShape`) with a two-path strategy: solid fills go through `getShapeFillRegions` → `tessellatePath` → GPU triangle meshes (`glShapeMesh`, crisp at any zoom), with a content-revision cache; gradient/bitmap fills and strokes fall back to an offscreen Canvas2D raster uploaded as a texture.
- **Scale-9 shape** (`defaultGlScale9ShapeRenderer`, `drawGlScale9Shape`, `drawGlScale9ShapeMask`, `buildGlScale9Mapper`, `remapGlScale9Commands`) — nine-slice with a mask path.
- **Sprite / QuadBatch / Tilemap** (`defaultGlSpriteRenderer`, `defaultGlQuadBatchRenderer`, `defaultGlTilemapRenderer`) over a real instanced batch (`glSpriteBatch`: `prepareGlSpriteBatchWrite`, `flushGlSpriteBatch`, per-instance material packing, blend-mode and texture-cache handling).
- **Text** — `defaultGlTextLabelRenderer`, `defaultGlRichTextRenderer` (with `drawGlRichTextWithOverlay`), and a `glTextInput` overlay seam (`enableGlTextInput`, `registerGlTextInputOverlay`, `drawGlTextInputOverlay`) for editable fields.
- **Video** (`defaultGlVideoRenderer`, `createGlVideoData`/`destroyGlVideoData`) with per-frame texture upload.
- **Particle emitter** (`defaultGlParticleEmitterRenderer`, `drawGlParticleEmitter`) rendering the simulated particle set on the GPU with a dedicated program, blend mode, and emitter-world transform folding.
- **Container/passthrough** (`renderGlDisplayObject` traversal walk, `defaultGlDisplayObjectRenderer`).

GPU subsystems beyond Canvas's reach:

- **Clipping & masking** — rectangle scissor stack (`pushGlClipRectangle`/`popGlClipRectangle`), arbitrary stencil contour clipping with winding rules (`pushGlClipContours`/`popGlClipContours`, even-odd & non-zero), `enableGlClipSupport` hook installation.
- **Material/shader system** — `registerDefaultGlMaterial`, color-transform material + shader (`registerGlColorTransformMaterial`, `registerGlColorTransformShader`, `registerGlUniformColorTransformMaterial`), per-instance material packing into the batch.
- **Render caching** — render-to-FBO cache (`enableGlRenderCache`, `createGlCacheState`, `ensureGlRenderCacheTarget`, `refreshGlRenderCache`, `getGlRenderCacheTarget`, `releaseGlRenderCache`) — the GPU analogue of `cacheAsBitmap`.
- **Velocity pass** (`glVelocity`) — a motion-vector render target and per-kind velocity writers (`renderGlVelocity`, `createGlVelocityTarget`, `registerGlVelocityWriter`, `getGlVelocityWriter`, default writers for display objects / quad batches / particle emitters), the substrate for per-object motion blur. This is a notably mature, GPU-specific feature.
- Low-level batch plumbing exported for advanced users: `ensureGlQuadBatchShader`, `useGlQuadBatchProgram`, `bindGlQuadBatchBaseAttributes`, `setGlQuadBatchWorldAndTexture`.

Testing depth is excellent: 25 colocated `*.test.ts` files for 25 source files (every non-barrel source has a test).

## Gaps vs an authoritative WebGL display-object renderer library

- **Offscreen-Canvas2D raster fallbacks are the main fidelity gap.** Gradient fills, bitmap fills, strokes (`glShape` falls through when `getShapeFillRegions` returns null), and all text (`glTextLabel`/`glRichText` rasterize through a 2D canvas) render at Canvas resolution and upload as a texture. An authoritative GL renderer would tessellate strokes, do GPU gradient shading, and render glyphs from an SDF/MSDF atlas (the codebase's own `text-shaping` seam anticipates exactly this). Today these paths are missing-by-omission, not by-design — `glShapeMesh`'s own comments frame the raster path as a fallback to be replaced. This is the single biggest reason the package is not yet "authoritative."
- **Shape commands are re-exported from `displayobject-canvas`** (`defaultGl*` are aliases of `defaultCanvas*`), with the barrel comment "shapes deferred to canvas for now." The GL package does not own its shape command vocabulary; it borrows the Canvas one.
- **No single registration convenience** (e.g. `registerGlDisplayObjectRenderers(state)`). Consumers must `registerRenderer` each `defaultGl*Renderer` against its kind individually. This is consistent with the tree-shakable, explicit-opt-in house style (arguably correct), but it means the package ships descriptors, not a turnkey "register everything" path — worth a deliberate decision rather than an accident.
- **No GPU filter/effect integration in-package.** Filters/effects live in `filters`/`effects`; this is by-design per the architecture, so not counted heavily against depth — but a reader expecting blur/glow to be a GL concern should know they are not here.
- **Antialiasing/MSAA, mipmapping, and texture-filtering policy** are not surfaced as part of this package's API; they live in the `render-gl` core. Reasonable boundary, but the seam means tessellated shape edges rely on whatever the core configures.

## Naming / API-shape notes

- Naming is consistent and self-identifying: `gl`-prefixed, full unabbreviated type words (`drawGlScale9Shape`, `registerGlUniformColorTransformMaterial`, `defaultGlParticleEmitterVelocityWriter`). Matches the codebase's filename-naming philosophy (backend-prefix-first) and the function-naming rules.
- Descriptor + free-function pairing is clean: a `default*Renderer` object plus an exported `draw*`/`render*` free function, so users can register the bundle or call the primitive.
- Teardown verbs are correct: `destroyGl*Data` frees GPU textures (a non-GC resource) — the right verb per the dispose/destroy rule.
- `register*`/`enable*` opt-in functions (clip support, render cache, text input, materials, velocity writers) follow the "no top-level side effects, caller opts in" rule.
- Minor: several public `draw*` signatures take `RenderProxy2D` while `createData` takes `Renderable`/`RenderState`, and a few params are typed `unknown[]` (`remapGlScale9Commands`) or cast through `as unknown as GlShapeData`. The internal-data casting is an internal-state pattern, not public surface, but the `unknown[]` remap signature is loose for a public export.

## Recommendation

Treat this as **solid, on track to authoritative**. To close the gap:

1. **Eliminate the Canvas2D raster fallbacks.** Add native GPU paths for gradient fills (gradient shader), bitmap fills, and stroke tessellation so `glShape` no longer falls through to an offscreen 2D canvas. Stop re-exporting shape commands from `displayobject-canvas` once GL owns its fill/stroke vocabulary.
2. **GPU text rendering.** Render glyphs from an SDF/MSDF atlas via the `text-shaping` seam instead of rasterizing through Canvas2D — this is the marquee missing feature for a WebGL text path and is already anticipated by the architecture.
3. **Decide the registration story explicitly.** Either keep per-descriptor registration as the deliberate tree-shakable golden path (document it) or add a clearly-named optional bundle registrar.
4. Tighten the one loose public signature (`remapGlScale9Commands`'s `unknown[]`).

The breadth (every leaf type plus clipping, masking, materials, caching, velocity, particles) is already authoritative-grade; the depth ceiling is set by how much still routes through a hidden raster instead of the GPU.
