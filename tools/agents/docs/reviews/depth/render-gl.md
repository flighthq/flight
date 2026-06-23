# Depth Review: @flighthq/render-gl

**Domain**

A WebGL2 **renderer backend core** — the subject-agnostic GPU plumbing layer beneath per-subject leaf renderers. Its declared job (per `package.json` and the render-layering doc) is "render state, targets, shaders, draw, and fullscreen passes." It is explicitly _not_ a full WebGL display-object/scene renderer: the 2D and 3D leaf renderers (`displayobject-gl`, `scene-gl`, particle/quad-batch draw) live in sibling packages and merely _consume_ the state and primitives this package owns. The canonical comparison is to the device/context abstraction tier of a graphics engine (think the "GL device + render-target + program + immediate-quad/fullscreen-blit" layer of bgfx, three.js's `WebGLRenderer` internals split into `WebGLState`/`WebGLRenderTargets`/`WebGLProgram`, or PixiJS's `Renderer` system objects), not to the full engine.

**Verdict: solid** — completeness **72/100** for the backend-core scope it claims (it would score far lower if judged as a full WebGL engine, but that breadth is by-design delegated to leaf packages).

## Present capabilities

Judged against a mature WebGL2 backend-core abstraction, the package covers most of the load-bearing axes with real depth, not stubs:

- **Context + render state lifecycle.** `createGlRenderState` (WebGL2 context acquisition with configurable `antialias`/`powerPreference`/`alpha`/`stencil` attributes, premultiplied-alpha blend setup, static quad index buffer, dynamic quad vertex buffer), `destroyGlRenderState` (carefully deduped program deletion + buffer teardown, with documented ownership decisions for shared/user/WeakMap-held resources), and the entity/runtime split (`createGlRenderStateRuntime`, `getGlRenderStateRuntime`).
- **Render targets — genuinely deep.** `createGlRenderTarget`/`destroyGlRenderTarget`/`resizeGlRenderTarget` realize a full `RenderTargetDescriptor`: **MSAA** (renderbuffer-backed multisample + `blitFramebuffer` resolve in `resolveGlRenderTarget`, with a SwiftShader `gl.flush()` workaround), **MRT** (`colorAttachments` + `drawBuffers`), **HDR float formats** (rgba16f/rgba32f with `EXT_color_buffer_float` enablement), and **depth-stencil** in both renderbuffer and _sampled-texture_ (`DEPTH24_STENCIL8`) variants. `beginGlRenderTarget`/`endGlRenderTarget` provide a correct, nesting-safe FBO/viewport/transform save-restore stack. `drawGlRenderTargetResult` composites a target with V-flip handling.
- **Render-target pool.** `createGlRenderTargetPool`/`acquireGlRenderTarget`/`releaseGlRenderTarget`/`destroyGlRenderTargetPool` — proper `acquire`/`release` bracketing keyed on (w,h,format,sampleCount), the right primitive for multi-pass effect recipes.
- **Shaders + programs.** Default bitmap program (`compileDefaultGlProgram`/`compileGlBitmapProgram`), custom fragment-shader bitmap shaders (`createGlBitmapShader` with an `onBind` uniform hook), attribute/uniform wiring (`setGlAttributes`, `setGlBaseUniforms`), and matrix→clip-space projection helpers (`setGlMatrixFromTransform`, `setGlMatrixFromValues`, `setGlQuadMatrixFromOffset`). `useGlProgram` does redundant-bind elimination.
- **Fullscreen pass primitive.** `compileGlFullscreenProgram` + `drawGlFullscreenPass` — N-input (`u_texture0..7`) clip-space-quad pass writing to a target or the canvas, plus `clearGlRenderTarget`. This is the substrate filters/effects draw through.
- **Immediate quad + texture management.** `drawGlQuad`, `bindGlTexture`/`createGlTexture`/`updateGlTexture` (WeakMap texture cache, premultiply-on-upload, smoothing→LINEAR/NEAREST), and `renderGlBackground` (clear).
- **Blend modes.** `applyGlBlendMode`/`enableGlBlendModeSupport` with an auditable `BlendMode → blendFunc` map (Normal/Layer/Add fixed-function; non-separable modes explicitly mapped to `null` → degrade to normal, documented as needing shader blending).
- **Registries (extensibility seams).** Per-state material-renderer registry (`registerGlMaterialRenderer`/`resolveGlMaterialRenderer` with `DefaultMaterialKind` fallback), per-material-kind shader registry (`registerGlMaterialShader`/`resolveGlShader`), per-node shader binding (`setGlShader`/`getGlShader`, installed lazily so it tree-shakes), and default-shader override (`registerGlBitmapShader`).
- **State tracking.** The runtime caches `currentProgram`/`currentTexture`/`currentBlendMode`/`currentFramebuffer` to elide redundant GL calls — the expected hot-path discipline.
- Colocated `*.test.ts` for every non-trivial source file.

## Gaps vs an authoritative GPU-backend-core library

Several axes a mature device/context abstraction is expected to own are absent or thin. Distinguishing by-design from by-omission:

- **No context-loss handling (by-omission).** There is no `webglcontextlost`/`webglcontextrestored` wiring and no resource-recreation path. A production WebGL backend must survive context loss; here a lost context silently invalidates every cached program/buffer/texture. This is a real gap, not delegable to leaf packages.
- **No capability/extension/limits introspection (by-omission).** Beyond an inline `MAX_SAMPLES` read and an ad-hoc `EXT_color_buffer_float` enable, there is no surfaced device-caps API (max texture size, max texture units, anisotropy, supported formats, float-linear, sRGB). Mature backends expose a `capabilities`/`extensions` object; consumers here must query `gl` directly.
- **Texture abstraction is shallow (partly by-design, partly by-omission).** Only RGBA8 2D textures from `CanvasImageSource`, CLAMP_TO_EDGE, no mipmaps. No cubemaps, no array/3D textures, no compressed-texture (`KTX`/`DXT`/`ETC`) upload, no anisotropic filtering, no configurable wrap/filter per texture, no sub-rect `texSubImage` update for partial uploads. `texture`/`camera`/`mesh` crates carry the 3D substrate, so cubemaps are plausibly delegated — but compressed textures and configurable sampler state are core GPU plumbing that is simply missing.
- **No explicit GL state for scissor/stencil clipping (by-omission within this package).** The runtime _type_ (`scissorStack`, `clipForms`, `currentMaskDepth`, `GlScissorRect`) reserves the clip/stencil machinery, but render-gl exports **no** `pushGlClip`/`popGlClip`/scissor functions — that logic lives in `displayobject-gl`. As a backend core, a scissor/stencil push-pop primitive arguably belongs here.
- **No uniform buffer objects / instancing primitives (by-design here).** The runtime type references particle/quad-batch/instanced shaders, but those buffers and draw calls are owned and driven by the leaf renderers, not exported here. Acceptable given the layering, though it means "draw" in this package is limited to single quads + fullscreen passes.
- **No depth/cull/viewport-scissor render-pipeline state API.** No exported control over depth-test, depth-write, cull-face, polygon offset, or stencil func/op beyond what the leaf renderers reach into `gl` for. A backend core typically owns these as cached state setters.
- **No GPU readback / pixel transfer (by-omission).** No `readPixels`/`copyTexImage` helper for capture or feedback; capture-style consumers must hit `gl` directly.
- **No debug/profiling surface.** No `KHR_debug` labels, no timer-query (`EXT_disjoint_timer_query`) wrapper, no draw-call counters. Mature backends expose at least optional instrumentation.
- **`compileShader` throws on failure (minor).** Shader compile/link errors `throw` rather than returning a sentinel; defensible as "programmer error" but a backend core often wants a non-throwing compile that returns `null` + log for hot-reload / fallback shader paths.

## Naming / API-shape notes

- Naming is consistent and self-identifying: every export carries the `Gl` prefix and the full operated-on type word (`createGlRenderTarget`, `resolveGlMaterialRenderer`, `drawGlFullscreenPass`). This matches the codebase rule and reads as a coherent device-API vocabulary.
- Teardown verbs are used correctly: `destroyGl*` for GPU resources (FBOs/textures/buffers/programs), `acquire`/`release` for the pool. No `dispose*` misuse.
- Allocation discipline is clean: `create*`/`acquire*` allocate, matrix helpers write into a passed `Float32Array`/`out`, hot-path helpers reuse runtime scratch buffers.
- One leaky abstraction: `makeGlState` (a test helper from `glTestHelper`) is exported from the package barrel (`index.ts`) into the public API. It belongs behind a test-only path, not the published surface.
- The `internal.ts` cast pattern is present (the `state as {...}` writes in `createGlRenderState`); the codebase docs flag this as a legacy approach to be replaced by runtime slots. Minor.
- `setGlMatrixFromTransform` accepts a structural `{a,b,c,d,tx,ty}` literal rather than `Readonly<Matrix>`, slightly loosening type intent vs the `*Like` convention, but this is a hot-path helper.

## Recommendation

Treat this as **solid backend-core infrastructure, not yet authoritative.** For the narrow "state + targets + shaders + draw + fullscreen" charter it states, render-target support (MSAA/MRT/HDR/depth-stencil/sampled-depth) and the pool are genuinely AAA-grade, and the registry/seam design is clean. To reach authoritative for a WebGL2 backend core, prioritize the gaps that no leaf package can own:

1. **Context-loss handling** — `webglcontextlost`/`restored` events and a resource-recreation contract. This is the single biggest correctness gap.
2. **A device-capabilities/extensions surface** — one introspection object (limits, supported formats, float-linear, sRGB, anisotropy) so leaf renderers stop reaching into `gl` directly.
3. **Richer texture/sampler abstraction** — configurable wrap/filter, mipmaps, `texSubImage` partial updates, and at minimum a compressed-texture upload path; defer cubemaps/array textures to the 3D `texture` crate.
4. **Promote the scissor/stencil clip primitive** (push/pop) into this package — the runtime type already reserves the state for it; the operations should live with the core, not in `displayobject-gl`.
5. **Add `readPixels`/capture and optional debug/timer instrumentation**, and remove `makeGlState` from the published barrel.

Lower priority but expected of a mature core: a non-throwing shader-compile path and explicit cached depth/cull/blend-equation state setters.
