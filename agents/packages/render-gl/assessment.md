---
package: '@flighthq/render-gl'
updated: 2026-07-22
basedOn: ./review.md
---

# render-gl — Assessment

## Directed

- **~~Add a real partial-target GL pass.~~** — retired 2026-08-05. Reconciled against source: `beginGlRenderPass` accepts a device-pixel `Viewport`, `resolveGlPassViewport` intersects both unbounded edges with target storage, nested pass state restores the exact viewport/scissor, and `resolveGlRenderTarget` disables then restores scissor around target-wide MSAA blits (`packages/render-gl/src/glRenderPass.ts`, `glRenderTarget.ts`).
2. **Keep GL runtime noise state-owned and private.** Current bindings, caches, scratch, lazy programs,
   and backend registries may hang from the RenderState runtime, but they are implementation facts rather
   than public semantic state.
- **~~Prove viewport behavior with raster functionals.~~** — retired 2026-08-05. Reconciled against source: `functional/scenes/render-pass-viewport.webgl.ts` draws and asserts partial color/depth preservation, nested restoration followed by an outer draw, edge-clamped 2D projection/clipping, and one camera in tall and wide viewports; `functional/baselines/render-pass-viewport.json` carries the WebGL raster fingerprint.
- **~~Do not create an upward application dependency.~~** — retired 2026-08-05. Reconciled against source: `packages/render-gl/package.json` has no application dependency, while `packages/application-gl/src/glApplicationRenderView.ts` consumes render-gl primitives from the assembly layer above it.

## Recommended

- **~~Make render-target pool matching preserve every storage axis.~~** — retired 2026-08-05. Reconciled against source: `matchesGlRenderTargetAxes` compares dimensions, primary and per-attachment formats, attachment count, sample count, depth mode, and color space; `glRenderTargetPool.test.ts` rejects heterogeneous-format and depth-mode mismatches.
- **~~Preserve heterogeneous MRT formats across resize.~~** — retired 2026-08-05. Reconciled against source: `GlRenderTarget.colorFormats` and `requestedAxes` retain the per-attachment formats, `resizeGlRenderTarget` re-resolves and reapplies every axis before storage allocation, and `glRenderTarget.test.ts` verifies heterogeneous formats plus sampled depth survive resize.
3. **Close fullscreen-present resource ownership.** The copy and linear-to-sRGB program WeakMaps and
   fullscreen VAO WeakMap are not reachable from destroyGlRenderState. Add explicit internal teardown
   hooks and tests for their programs/VAOs.
4. **Replace the unit-blind texture cache with private state-owned binding facts.** `currentTexture`
   records neither active unit nor target, yet `scene2d-gl` still trusts it to skip a bind while
   scene/material paths bind many units. Track active unit plus per-unit/target bindings privately, or
   bind unconditionally at the few remaining call sites. Route pixel unpack state through the same
   internal tier: element/video uploads currently set `UNPACK_PREMULTIPLY_ALPHA_WEBGL` ad hoc and leave
   its effective state implicit. Do not add either implementation detail to public `GlRenderState`.

## Depth gaps

1. **Define the HDR display-output contract.** A linear rgba16f target currently receives only the sRGB
   transfer function on present. Values above display white are encoded then clamped by the canvas; the
   no-effects path therefore has no exposure/tone-map/display transform. Make tone-map choice explicit
   in the presentation assembly while keeping the transfer pass bedrock and subject-agnostic.
- **~~Make float-target negotiation explicit and observable.~~** — retired 2026-08-05. Reconciled against source: `createGlRenderTarget` and `resolveGlRenderTargetAxes` expose required/preferred policies, `isGlRenderTargetFormatSupported` queries capability, and `explainGlRenderTarget` reports requested-versus-effective axes; `glRenderTarget.test.ts` covers preferred fallback and required refusal before allocation.
3. **Grow color-space metadata beyond linear/sRGB when required.** Working primaries, display primaries,
   transfer, white point, and gamut mapping should be explicit descriptors/passes rather than hidden
   assumptions in textures or present.
4. **Complete the device tier only as consumed primitives.** Capabilities/extensions, context loss and
   recreation, cached depth/cull/color-mask setters, samplers, compressed upload, timer queries, and
   statistics remain gaps; avoid a monolithic device wrapper or eager feature registration.
5. **Make all state-owned GPU caches deterministically destructible.** WeakMap ownership is acceptable
   for lookup, but RenderState destruction must reach every program, VAO, framebuffer, buffer, sampler,
   and state-owned texture it creates.
6. **Remove backend implementation noise from the `create*` Entity vocabulary.** Native products such as
   `WebGLProgram`, `WebGLTexture`, and `HTMLCanvasElement` cannot truthfully carry Flight's Entity runtime
   slot. Name their irreducible operations for what they do (`compile*`, `allocate*`, or `build*`) and keep
   public `create*` for Entity-backed Flight objects such as GlRenderState/GlRenderTarget. Runtime-record
   constructors and private cache factories should be internal unless a caller genuinely composes them.
7. **Narrow the exported runtime seam.** `GlRenderStateRuntime` currently places binding trackers,
   sprite batches, registries, caches, scratch, and optional package hooks into one header-layer shape.
   State ownership is correct; exposing the aggregate implementation record is not. Custom renderers
   should receive small operation/context contracts, while sibling packages attach private runtime
   records plus deterministic teardown callbacks without growing a cross-package kitchen-sink type.
8. **Disambiguate the compressed-texture upload sentinel, and share one shape classifier.**
   `uploadGlCompressedTextureContainer` returns a single `false` across three distinct causes —
   unsupported texture shape, still-wrapped supercompression, and no payload — so a caller cannot tell
   "this is a volume, use a 3D binder" from "inflate the Zstd first." Rejection-as-sentinel and
   rejecting *before* any GL call are both correct (they follow the inversion rule); the missing piece
   is a paired `explainGlCompressedTextureUpload(container)` returning plain data that names the fixing
   step. Separately, container-shape classification is now expressed twice with different thresholds
   (`isSupportedGlCompressedTextureContainerShape` accepts 2D/array/single-cube; the inline
   `uploadGlCompressedImageResource` gate accepts 2D only) — both correct today, but a shared
   `getGlCompressedTextureContainerShape → 'texture2d' | 'cube' | 'array' | 'unsupported'` classifier
   would keep the two gates provably consistent and give the future cube/array binders one truth. Low
   severity: these are setup-time errors, and this composes with the compressed-upload work already
   flagged in Depth gap #4.

## Backlog

- Non-separable blend modes remain shader effects, not fixed-function registrations.
- General context recreation needs a cross-package resource-recreation contract.
- Rust parity follows the settled GL contract.

## Approved

None.
