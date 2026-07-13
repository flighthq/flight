---
package: '@flighthq/render-wgpu'
status: solid
score: 78
updated: 2026-07-13
ingested:
  - charter.md
  - status.md
  - prior review.md (2026-06-24)
  - source + tests (live tree)
  - agents/render-architecture.md + render-backend-support.md
---

# render-wgpu — Review

> Full re-survey of the **live tree** (`packages/render-wgpu/src/`, 14 source + 14 test files, 96 tests). The prior review (2026-06-24) surveyed the `builder-67dc46d64` **bundle**, which did not land wholesale: the live package is a different, in places leaner and in places richer, shape. Landed from the bundle: scissor, fullscreen pass, adapter capabilities, shader registry (reshaped), the `WgpuAdapterCapabilities`/`WgpuFullscreenPipeline` types. **Not in the live tree:** timestamp queries (`wgpuTimestampQuery.ts`), the device-lost/resize signal group (`wgpuRenderStateSignals.ts`), MSAA (no `sampleCount` option, pipeline key, or msaa texture), the depth-write pipeline variant, `requiresWgpuBlendReadback`, and the 18-pipeline warm set (now 2). New since: `wgpuMaterialRegistry.ts`, `wgpuShaderBinding.ts`, `wgpuElement.ts`, HDR format-keyed pipelines, a hardened capture path, sprite-batch/clip-contour/shape-mesh runtime plumbing, and 5-bind-group negotiation for the forward-lit 3D path.

## Verdict

**solid — 78/100.** A genuine, subject-agnostic WebGPU backend core with excellent opt-in discipline and a first-class, environment-hardened capture path — but the charter's own identity paragraph and one blessed Decision describe capabilities (MSAA, timestamp profiling, a device-lost signal group) that do not exist in the live tree, teardown leaks the frame-capture GPU resources, `@flighthq/displayobject` is still a mis-declared runtime dependency, and the destination-read blend modes now fall back to Normal *silently* — the honest predicate the bundle had was not carried over.

## Present capabilities

- **Render state lifecycle** (`wgpuRenderState.ts`) — `createWgpuRenderState` (adapter/device negotiation with `powerPreference`; requests `maxBindGroups: 5` when the adapter allows, for the forward-lit 3D pipeline's Frame/Draw/Material/Shadow/Ibl groups; configures the canvas `premultiplied` + `COPY_SRC`; allocates the 4096-slot uniform ring aligned to `minUniformBufferOffsetAlignment`), `createWgpuRenderStateRuntime`, `getWgpuRenderStateRuntime`, `destroyWgpuRenderState` (uniform buffer, particle buffer, depth-stencil, sprite-batch pool slots; honest about not owning the shared device), `isWgpuSupported`. Runtime attached under `EntityRuntimeKey`; no `internal.ts` cast anywhere — the runtime-slot pattern throughout (better than `render-gl`, which still carries `internal.ts`).
- **Frame loop** (`wgpuBackground.ts`) — `renderWgpuBackground` / `submitWgpuRenderPass`: per-frame ring/batch/mask/scissor reset, lazy depth-stencil (re)allocation, capture-texture redirect, single deferred submit with `writeBuffer` of the used ring portion, and post-submit destruction of `retiredBuffers` (mid-frame-replaced buffers kept alive until the encoder that references them submits — a correct, well-commented lifetime discipline).
- **Pipeline + blend** (`wgpuShader.ts`) — `getWgpuPipeline` keyed `blendMode-stencilMode-format` (format matters: HDR `rgba16float` effect targets get their own variants via `runtime.currentColorFormat`); `getActiveWgpuPipeline` resolves stencil mode from mask depth; `BLEND_MODES` realizes the fixed-function set — Add, Darken (min), Erase, Lighten (max), Multiply (premultiplied `dst`/`one-minus-src-alpha`), None, Normal/Layer, Screen, Subtract (reverse-subtract) — mirroring `DEFAULT_GL_BLEND_MODES`; Alpha/Difference/HardLight/Invert/Overlay/Shader are `null` → Normal fallback. `writeWgpuQuadUniforms`/`writeWgpuMatrixOnlyUniforms` pack the 128-byte slot (mat3x3 + alpha + color transform + corners/UVs); `setWgpuMatrixFromTransform` does pixel→clip.
- **Draw path** (`wgpuDraw.ts`) — `drawWgpuQuad`/`drawWgpuQuadWithTransform`/`submitWgpuQuadDraw` (dynamic-offset bind group 0, stencil reference from mask depth), `bindWgpuTexture` (WeakMap cache; premultiplied upload with a good semantic comment), `createWgpuTextureEntry`/`updateWgpuTextureEntry`, `applyWgpuBlendMode`/`enableWgpuBlendModeSupport` (opt-in seam on `state.applyBlendMode`), `getWgpuRenderProxyColorTransform`, `warmWgpuPipelines` (Normal + Add).
- **Offscreen targets + pool** (`wgpuRenderTarget.ts`, `wgpuRenderTargetPool.ts`) — create/destroy/resize with format parameter (HDR documented), begin/end with a saved-pass stack (`WgpuSavedPassState`: view, viewport, transform, color format), Y-flipped result blit that is alias-safe (locals first), pool matching on `(width, height, format)` with paired `acquire`/`release` brackets and an explicit "MSAA intentionally out of scope" note.
- **Scissor** (`wgpuScissor.ts`) — push/pop/apply; apply clamps to ≥1×1 integers. Note: push *replaces* the active rect (save/restore, not intersect) — nested-rect intersection, if wanted, is the leaf's job today.
- **Fullscreen pass** (`wgpuFullscreenPass.ts`) — `createWgpuFullscreenPipeline` (N input-texture bind-group layouts + optional uniforms group), `drawWgpuFullscreenPass`, `destroyWgpuFullscreenPipeline` (documented no-op for symmetry). Consumed by `effects-wgpu`.
- **Registries** — `registerWgpuBitmapShader` (state-wide default shader), `setWgpuShader`/`getWgpuShader`/`resolveWgpuShader` (per-node binding via a WeakMap + a runtime resolver slot, tree-shaken until first use — a clean cost-on-opt-in design), `registerWgpuMaterialRenderer`/`getWgpuMaterialRenderer`/`resolveWgpuMaterialRenderer` (open registry, `DefaultMaterialKind` fallback, unresolved = no-op never a built-in — textbook fork-B shape). The 3D mesh-material registry slot (`sceneMeshMaterialRegistry`) is owned by `scene-wgpu`, held here as a nullable runtime slot.
- **Capture readback** (`wgpuSurface.ts`) — the conformance instrument, meaningfully hardened since the prior review: `enableWgpuFrameCapture` redirects the frame into an offscreen `COPY_SRC` texture (headless/software adapters never present the swapchain), `encodeWgpuFrameCapture` copies texture→buffer *within the frame's encoder* (later-task GPU work is dropped on those adapters), `createSurfaceFromWgpuRenderState` maps the retained buffer, normalizes BGRA→RGBA, and deliberately keeps premultiplied pixels (the un-premultiply quantization rationale is documented). North star #5 is genuinely met.
- **Adapter capabilities** (`wgpuAdapterCapabilities.ts`) — `getWgpuAdapterCapabilities` (float32-filterable, timestamp-query, maxTextureDimension2D, maxSampleCount=4 conservative).
- **Test seam** — `installWgpuMock`/`createWgpuRenderStateForTest` exported from the barrel and consumed by `displayobject-wgpu`/`scene-wgpu` tests (a deliberate cross-package test seam; `render-gl` keeps its helper private — an asymmetry, below).

Tests: 96 across 14 colocated files, jsdom + the mock (which stashes pipeline descriptors so blend/target state is assertable). Every source module has its test file; `wgpuTestHelper.ts` itself has none despite exporting from the barrel.

## Gaps

Measured against the charter (which speaks broadly now) and a textbook mature WebGPU backend core:

- **Charter-claimed capabilities absent.** The charter's "What it is" names MSAA draw-and-resolve, the `sampleCount[-depthwrite]` pipeline key, timestamp profiling, and a tree-shaken device-lost signal group. None exist in the live tree — they were bundle features that never landed. Either the charter over-describes or the package under-delivers; the mismatch needs the user's call (see Charter contradictions).
- **Device loss: nothing.** No `device.lost` wiring, no signal, no `pushErrorScope`/`popErrorScope`. This is not just an AAA gap — the 2026-07-02 Decision "Context/device loss: detect and signal minimum" is blessed and unimplemented. The `WgpuRenderStateSignals` type sits orphaned in `@flighthq/types` with no producer anywhere.
- **Destination-read blends are now *silently* approximated.** Difference/HardLight/Invert/Overlay are `null` → Normal, and the bundle's `requiresWgpuBlendReadback` predicate was not carried over, so a caller can no longer even detect the degrade (the diagnostics inversion rule would want at least an `explain*`/guard seam). The read-back pass itself stays gated on Open direction #3.
- **No mipmaps / anisotropy / wrap modes.** Samplers are exactly linear+nearest, clamp-to-edge; no `generateWgpuTextureMipmaps`, no mip chain, no `maxAnisotropy`, no repeat addressing — `@flighthq/texture`'s sampler descriptors (wrap/filter/anisotropy) have no realization here. Sampler choice is also baked from global `state.allowSmoothing` at first bind and cached (the per-bitmap-smoothing gap #3 in render-backend-support applies to wgpu as well as gl).
- **Teardown leaks capture resources.** `destroyWgpuRenderState` destroys the uniform/particle/depth-stencil/batch-pool buffers but not `frameCaptureTexture`, `frameCaptureBuffer`, or any pending `retiredBuffers` — a direct North-star-#3 (deterministic teardown) violation for a state that enabled capture.
- **Uniform ring overflow is unguarded.** 4096 slots per frame; past that, `writeWgpuQuadUniforms` writes out of bounds (silently dropped by the typed array) and `submitWgpuRenderPass`'s `writeBuffer` fails confusingly. No guard module, no `explain*`.
- **No MSAA anywhere** — main pass or offscreen targets — while `WgpuRenderOptions.antialias` exists in types and is read by nothing (a dead option field).
- **Per-call bind-group allocation in `drawWgpuFullscreenPass`** — a fresh `createBindGroup` per input per pass per frame; a mature core caches these (the render-target path already caches its bind group on the target).
- **No compressed-texture upload** (`texture-formats` parses KTX2/DDS/Basis; nothing here can upload a described compressed texture), **no error scopes**, **no instanced batch primitive in the core** (the sprite-batch *state* lives on the runtime here, but the batch logic is `displayobject-wgpu`'s — consistent with the still-open core/leaf cut, Open direction #2).
- **Known cross-package deltas confirmed still open:** orthographic projection blank on wgpu (nothing in this package or `scene-wgpu` remaps NDC z to [0,1] — gap #6), punctual lights not consumed by `scene-wgpu` (no point/spot/hemisphere uniforms in its shaders — gap #8). Both live outside this package but bound its "full parity" story.

## Charter contradictions

1. **"What it is" describes a package that does not exist.** MSAA draw-and-resolve, the `blendMode-stencilMode-format-sampleCount[-depthwrite]` cache key, timestamp profiling, and the device-lost signal group are all named as owned capabilities; the live key is `blendMode-stencilMode-format` and the rest are absent. The charter was authored (2026-07-02) against the bundle's shape. Candidate revision — or a directive to build to it; the user's call.
2. **Decision 2026-07-02 "Context/device loss: detect and signal minimum" is unimplemented.** No detection, no signal. Highest-value contradiction: a blessed ruling with zero code behind it.
3. **North star #1 (no subject dependency) vs `package.json`.** `@flighthq/displayobject` sits in `dependencies` but is imported only by `wgpuDraw.test.ts` and `wgpuShaderBinding.test.ts` (verified — no runtime import). The inversion the charter names is real but manifest-only; the fix is a one-line demotion.
4. **North star #3 (deterministic teardown) vs the capture leak** in `destroyWgpuRenderState`, above.

Otherwise the North stars hold well: no subject imports in runtime source, strong `enable*`/`register*` opt-in gating (capture, blend support, shader binding, color-adjustment fold all cost nothing un-opted), and file-level symmetry with `render-gl` (Background/Draw/Element/FullscreenPass/MaterialRegistry/RenderState/RenderTarget(+Pool)/Shader/ShaderBinding/ShaderRegistry line up 1:1).

## Contract & docs fit

**Package → contract:** types-first (all shapes in `@flighthq/types`, including the very well-commented `WgpuRenderStateRuntime`); single root export, `sideEffects: false`, no top-level registration; full unabbreviated `Wgpu` names; sentinels for expected failures (`resolveWgpuMaterialRenderer` → null, scissor/draw no-op without a pass) and throws only for environment/API misuse (`createWgpuRenderState`, `createSurfaceFromWgpuRenderState` — both defensible); paired pool brackets; alias-safe out-param composition in `drawWgpuRenderTargetResult`. Minor: barrel-exported `installWgpuMock`/`createWgpuRenderStateForTest` have no colocated test file.

**Contract/admin docs → candidate revisions:**

- `agents/index.md`'s render-backend-support summary bullet still reads "blend modes (gl = Normal+Add only, wgpu = none)" — stale in both directions; the live `BLEND_MODES` (and `render-backend-support.md` itself) have both GPU backends realizing the full fixed-function set. The prior review's "Package Map silence" item, by contrast, **landed**: the map now carries `render-wgpu` and the leaves.
- `render-backend-support.md` remains accurate for wgpu rows spot-checked (fixed-function blends ✓, ortho gap #6 ✓, punctual lights gap #8 ✓).
- Stale in-source comments: `wgpuAdapterCapabilities.ts` tells callers to pass `options.adapterCapabilities` and references `enableWgpuTimestampQueries` — neither exists; `WgpuRenderState.ts`'s `pipelineCache` comment says "keyed by blend mode + stencil mode + color transform flag" (actual: format, no color-transform flag).
- Orphans in `@flighthq/types`: `WgpuRenderStateSignals` (no producer), `WgpuRenderOptions.antialias` (no reader). Removal vs. wiring is gated on the signals/MSAA directions.
- gl↔wgpu barrel asymmetry (North star #2, surfaced toward the `render-gl` cell): `render-gl` does not export `glShaderRegistry` (`registerGlBitmapShader`) or its test helper from its barrel, while wgpu exports both; and the readback seam names differ (`glReadback.ts`/`readGlRenderTargetPixels` vs `wgpuSurface.ts`/`createSurfaceFromWgpuRenderState`).

## Candidate open directions

The charter's nine Open directions remain live; this survey adds/updates:

1. **Were MSAA, timestamps, and signals dropped deliberately or lost in landing?** The charter describes them; the tree lacks them; `status.md` records no removal. Settle whether the charter is trimmed or the features are re-chartered as build items (subsumes ODs #5, #9 and the orphaned types).
2. **Degrade visibility for the four destination-read blends** — with `requiresWgpuBlendReadback` gone, should the core ship an `explain*`/guard seam for the silent Normal fallback (independent of whether the read-back pass is ever built, OD #3)?
3. **Sampler realization** — should this core realize `@flighthq/texture`'s sampler descriptors (wrap/anisotropy/mips), or is that a leaf/`scene-wgpu` concern? (Sharpens OD #9's texture-quality half.)
4. **Is the barrel-exported test mock blessed?** `installWgpuMock` is now cross-package public API consumed by two leaf packages' tests; `render-gl` keeps its helper private. Bless the seam (and mirror it in gl) or move it out of the public surface.
