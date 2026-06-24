---
package: '@flighthq/displayobject-gl'
status: solid
score: 80
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/displayobject-gl.md
  - reviews/maturation/depth/displayobject-gl.md
  - source
  - changes.patch (incoming/builder-67dc46d64)
---

# Review: @flighthq/displayobject-gl

## Verdict

solid — **80/100**. A genuinely deep, broad WebGL2 leaf-renderer suite — every 2D display-object leaf type plus GPU-only clipping/masking, materials, render caching, velocity, and particles. The builder-67dc46d64 pass made real, verifiable improvements (turnkey registration, full WebGL1→WebGL2 shader migration, a hot-loop allocation fix), nudging it a couple of points above the prior 78. The ceiling is still set by the same architectural fact the depth review named: gradient/bitmap shape fills, strokes, and all text route through a hidden offscreen-Canvas2D raster instead of the GPU. One status claim does **not** survive into the bundle head and is the most important finding below.

## What the incoming pass changed (verified against the diff)

All four substantive source deltas in `67dc46d64:packages/displayobject-gl/` check out against `changes.patch`:

- **`registerGlDisplayObjectRenderers(state)`** — new `glDisplayObjectRegistration.ts`, registers all twelve built-in renderers (Bitmap, DisplayObject, ParticleEmitter, QuadBatch, RenderCache, RichText, Scale9Shape, Shape, Sprite, TextLabel, Tilemap, Video) in one call. Added to the barrel. Colocated test (`glDisplayObjectRegistration.test.ts`, 13 tests) asserts each kind→renderer binding via `getRenderStateRuntime(state).rendererMap`. The docstring correctly frames per-descriptor registration as the tree-shakable golden path and notes the default material is registered separately. This directly resolves the depth review's "no single registration convenience" gap — by deliberate decision, not omission. Good.
- **WebGL1→WebGL2 shader migration** — `glClipContours.ts` and `glShapeMesh.ts` shaders moved to `#version 300 es` (`attribute`→`in`, `gl_FragColor`→declared `out vec4 fragColor`), and their `WeakMap`/`compileProgram` keys retyped from `WebGLRenderingContext` to `WebGL2RenderingContext`. Verified: every shader-bearing file in the package (`glClipContours`, `glColorTransformMaterial`, `glMaterials`, `glUniformColorTransformMaterial`, `glParticleEmitter`, `glSpriteBatch`, `glVelocity`, `glShapeMesh`) now uses `#version 300 es`; no `WebGLRenderingContext` (non-2) reference remains in source. The status claim "all shaders consistently WebGL2" holds.
- **Hot-loop allocation fix in `glShapeMesh.ts`** — `shapeMeshMatrix()` previously did `new Float32Array([...])` per call (per shape, per frame). It now writes into a module-scope `shapeMeshMatrixScratch = new Float32Array(9)` and returns it. The scratch is alias-safe in practice: the only caller (`drawGlShapeMeshes`, line 38) consumes it synchronously in `gl.uniformMatrix3fv` before any reuse, and `shapeMeshMatrix` reads all `renderProxy.transform2D` inputs into a local `t` before writing the array. Comment explains the reuse. Matches the established `matrixArray` scratch pattern in `render-gl`.
- **`ensureGlQuadBatchShader` test coverage** — `glSpriteBatch.test.ts` gains a `describe('ensureGlQuadBatchShader')` block (3 tests: first-call compile+store, idempotent identity, corner-buffer creation), closing an `exports:check` gap.

A types-first stub also landed cross-package: `GlBitmapSamplingLike` / `GlBitmapSamplingFilter` (`'linear' | 'nearest'`) in `packages/types/src/GlBitmapSampling.ts`, exported from the types barrel (line 117 — verified). It is **defined but unconsumed** — no reference in `displayobject-gl` or `render-gl` source. The status acknowledges the plumbing (through `prepareGlSpriteBatchWrite`/`bindGlTexture`) is deferred as a cross-package change. This is a legitimate types-first first step, not dead code, but worth tracking so it does not rot as an orphan type.

## Present capabilities

Full leaf-renderer coverage, each an exported renderer descriptor with a paired `draw*`/`render*` free function:

- **Bitmap / Sprite / QuadBatch / Tilemap** over a real instanced sprite batch (`glSpriteBatch`: `prepareGlSpriteBatchWrite`, `flushGlSpriteBatch`, `ensureGlQuadBatchShader`, per-instance material packing, blend-mode + texture-cache handling). The batch VS/FS use `layout(location=…)` instanced attributes — genuinely WebGL2.
- **Shape** (`defaultGlShapeRenderer`, `drawGlShape`) with the two-path strategy: solid fills → `getShapeFillRegions` → tessellated triangle meshes (`glShapeMesh`, crisp at any zoom, content-revision cached); gradient/bitmap fills and strokes fall through to the offscreen-Canvas2D raster path (`glShapeMesh.ts` comment names this explicitly).
- **Scale-9 shape** with a mask path (`drawGlScale9Shape`, `drawGlScale9ShapeMask`, `buildGlScale9Mapper`, `remapGlScale9Commands`).
- **Text** — `defaultGlTextLabelRenderer`, `defaultGlRichTextRenderer` (+ overlay), and an editable-field overlay seam in `glTextInput` — all currently rasterizing glyphs through Canvas2D.
- **Video** with per-frame texture upload.
- **Particle emitter** rendered on the GPU with a dedicated program.
- **Container/passthrough** traversal (`renderGlDisplayObject`).

GPU subsystems beyond Canvas's reach, all still in-package:

- **Clipping & masking** — rectangle scissor stack (`pushGlClipRectangle`/`popGlClipRectangle`), arbitrary stencil contour clipping with even-odd & non-zero winding (`pushGlClipContours`/`popGlClipContours`), `enableGlClipSupport`.
- **Material/shader system** — `registerDefaultGlMaterial`, color-transform material + shader, uniform-color-transform variant, per-instance material packing.
- **Render caching** — render-to-FBO `cacheAsBitmap` analogue (`enableGlRenderCache`, `ensureGlRenderCacheTarget`, `refreshGlRenderCache`, …).
- **Velocity (motion-vector) pass** — `renderGlVelocity`, `createGlVelocityTarget`, `registerGlVelocityWriter`/`getGlVelocityWriter`, default writers for display objects / quad batches / particle emitters. The generic velocity **data** now comes from `@flighthq/velocity` (`getVelocity`); the GL backend owns only the rasterization side — a clean seam consistent with the subject/backend split.

Teardown verbs are correct (`destroyGl*Data` frees GPU textures). `register*`/`enable*` opt-in functions follow the no-top-level-side-effects rule. Naming is `gl`-prefixed, full, unabbreviated, self-identifying. Testing depth remains excellent: a colocated `*.test.ts` for every source file (26 source / 26 test files in the head tree).

## Gaps vs an authoritative WebGL display-object renderer

These are unchanged from the depth review — the incoming pass closed API-shape/correctness gaps, not the fidelity ceiling:

- **Offscreen-Canvas2D raster fallbacks are the dominant fidelity gap.** Gradient fills, bitmap fills, strokes, and all text rasterize through a 2D canvas and upload as a texture — resolution-bound, undercutting the "WebGL renderer" promise. Native paths missing: a gradient fragment shader (`glGradientFill`), GPU stroke tessellation (`glStroke`, consuming a `tessellateStroke` from `@flighthq/path`), GPU bitmap fills, and an SDF/MSDF glyph atlas for text. The text path additionally awaits the `@flighthq/text-shaping` seam (designed, not built as of 2026-06-22).
- **Shape command vocabulary is borrowed, not owned.** `index.ts` still re-exports thirteen `defaultGl*` shape commands as aliases of `defaultCanvas*` from `@flighthq/displayobject-canvas` ("shapes deferred to canvas for now"), and `@flighthq/displayobject-canvas` remains a runtime `dependency`. The package does not own its fill/stroke command surface; it cannot drop the canvas dep until native fill/stroke land.
- **No texture-cache eviction policy.** `textureCache` is a `WeakMap` with manual `deleteTexture`; no LRU/size budget. `GlBitmapSamplingLike` exists as a type but is unreachable from any draw call.
- **Context-loss recovery, shape-mesh batching/instancing, advanced blend modes, and velocity/cache writers for the new GPU paths** are all absent — Gold-tier per the maturation roadmap.
- **Rust port (`flighthq-displayobject-gl`)** not yet mirrored; roadmap defers it until the raster fallbacks are gone so the port doesn't track the wrong architecture.

## Charter contradictions

The charter is a stub: only "What it is" is filled; North star, Boundaries, Decisions, and Open directions are all `TODO`. There is therefore **no stated principle, boundary, or decision for the code to contradict** — nothing to flag here. The cost is that nearly every judgement below falls back to the codebase-map AAA standard (see Candidate open directions). The "What it is" line is accurate to the source.

## Contract & docs fit

Lives up to the contract on most axes:

- **Single root barrel**, `"sideEffects": false`, no per-file `exports` subpaths — conforms.
- **Types-first** — `GlBitmapSamplingLike` was correctly added to `@flighthq/types` before any implementation, the header-layer rule honored even for a deferred feature.
- **Full unabbreviated names, sentinel-not-throw, `register*`/`enable*` opt-in, `destroy*` for GPU resources** — all conform.
- **Rust mirror** — `crate: flighthq-displayobject-gl` is declared in the charter front matter; the crate is a planned-but-deferred target, consistent with the rust-port map's tier table.

Two contract-fit concerns:

1. **The render-gl test-helper export is broken in the bundle head — and the status claims the opposite.** Every one of the ~22 `displayobject-gl/src/*.test.ts` files imports `{ makeGlState } from '@flighthq/render-gl'`. In **base**, `render-gl/src/index.ts` exported `export { makeGlState } from './glTestHelper';`. In **head**, that line is **removed** and not replaced — the head barrel exports neither `glTestHelper` nor `makeGlState`, and `render-gl/package.json` has only the `.` export (no subpath). So in the head tree `makeGlState` is unresolvable from `@flighthq/render-gl`, which would fail the entire displayobject-gl test suite at import time. The status doc claims the inverse — that this pass _added_ `export * from './glTestHelper'` to fix "all 22 test files failing… now 193/193 passing." That added line is not present in head; a later edit to the render-gl barrel (the same pass that added `glShaderRegistry`/`glTexture`/etc. exports) appears to have dropped it. **This is the highest-value finding: the "193/193 passing" claim is not reproducible from the bundle as captured.** It is a cross-package (`render-gl`) regression, surfaced here because this package is its sole observed casualty. (Independent of which barrel fixes it, exporting a `*TestHelper` from a production barrel is itself a smell — `completeness.ts` exempts it from `exports:check`, but the cleaner seam is a dedicated test-only entry rather than the production root.)
2. **`remapGlScale9Commands` still takes `unknown[]`.** The depth review flagged this as the one loose public signature; the status declines to tighten it, arguing `ShapeData.commands` is `unknown[]` codebase-wide (the flat `[key, argCount, ...args]` buffer). That reasoning is sound — tightening here alone would be inconsistent — but it makes the fix a **codebase-wide command-buffer-type decision**, not a within-package cleanup. Worth surfacing as such rather than leaving it as a per-package "loose signature."

Docs-fit (candidate revisions to admin docs, not actions): the codebase map's render section and the rust map both already reflect the post-2026-06-22 `<subject>-<backend>` reorg, `@flighthq/clip`, `@flighthq/velocity`, `@flighthq/filters-gl`, and standalone `@flighthq/particles` — so the depth review's "glVelocity / clip are in-package" framing is now partially superseded by neighbor packages owning the data/region layers while this package owns the GL rasterization. The review above reflects the current split; no map line is stale for this package.

## Candidate open directions

The charter's silence forces these assumptions; each is a question for the user to settle into the charter:

- **North star.** Is the durable bar "eliminate every Canvas2D raster fallback — a true GPU renderer," or "a GPU-accelerated blitter that is allowed to fall back to raster for rare fill/text cases"? The whole gradient/stroke/SDF-text arc is gated on this answer. The depth/maturation reviews assume the former; it is not blessed.
- **Boundaries.** Is owning the shape command vocabulary (dropping the `@flighthq/displayobject-canvas` runtime dep) in scope, or is "borrow Canvas's shape commands" an accepted permanent boundary? And does AA/MSAA/texture-filtering policy belong here or stay in the `render-gl` core?
- **Registration story (now decidable).** `registerGlDisplayObjectRenderers` exists; bless it as the sanctioned convenience path alongside per-descriptor registration, or treat the turnkey registrar as a non-goal. This is a one-line Decision the pass has already implemented.
- **GPU text gating.** Whether to build a measure-only Canvas-fed glyph atlas now (better-cached raster) or wait for `@flighthq/text-shaping` — a project-level dependency decision the package cannot make alone.
- **Texture-cache eviction semantics.** Budget by pixel count vs texture count vs VRAM estimate, and whether to trade `WeakMap` GC-safety for explicit eviction — a cross-package (`types` + `render-gl`) design fork.
- **Closed-union vs registry (structural fork B).** The velocity writers already use an open registry (`registerGlVelocityWriter`); good. Confirm no closed `switch(kind)` creeps into the gradient/stroke/blend-mode paths as they grow — blend modes especially are a family that should be registry-dispatched, with dispatch hoisted out of the per-instance hot loop.
