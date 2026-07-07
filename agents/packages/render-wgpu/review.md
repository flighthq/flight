---
package: '@flighthq/render-wgpu'
status: solid
score: 84
updated: 2026-06-24
ingested:
  - status.md
  - source
  - changes.patch
---

# render-wgpu — Review

> Evidence: `incoming/builder-67dc46d64/head/packages/render-wgpu/` (source + tests) and `incoming/builder-67dc46d64/changes.patch` (the delta). No prior `reviews/depth/render-wgpu.md` exists, so this is the first survey of the package. Charter is a stub — judged against the codebase-map AAA standard and the Rust render-layering map, with each silence flagged below.

## Verdict

**solid — 84/100.** A genuine, well-shaped WebGPU backend core: ring-buffered uniforms, a format/stencil/sample-count/depth-keyed pipeline cache, a fixed-function blend table covering the expressible `BlendMode` set with an honest read-back predicate for the rest, offscreen render targets + pool, MSAA, frame-capture readback, timestamp profiling, a fullscreen-pass primitive, a shader registry mirroring `render-gl`, and a tree-shaken device-lost signal group. The status doc's pass-1/pass-2 claims verify against the diff almost exactly (test counts 107/16 match; every named file and type is present). The score sits below the status's self-estimate of 91 because several shipped primitives are exported-but-unwired, one async-readback path has a latent multi-frame hazard, a layering dependency on `@flighthq/displayobject` is mis-declared, and the Rust crate has not been brought to parity.

## Present capabilities

Grounded in `67dc46d64:packages/render-wgpu/src/`:

- **Render state lifecycle** (`wgpuRenderState.ts`) — `createWgpuRenderState` (async; negotiates adapter/device, configures the canvas context with `COPY_SRC` for readback, allocates the uniform ring buffer aligned to `minUniformBufferOffsetAlignment`, warms pipelines), `getWgpuRenderStateRuntime`, `createWgpuRenderStateRuntime`, `destroyWgpuRenderState` (destroys owned GPU buffers/textures, explicitly _not_ the shared device — well-documented ownership), `isWgpuSupported`. Entity/runtime split honored via `EntityRuntimeKey`.
- **Frame loop** (`wgpuBackground.ts`) — `renderWgpuBackground` / `submitWgpuRenderPass`, with lazy depth-stencil and MSAA-texture (re)allocation on resize, the standard MSAA draw-into-multisample/ resolve-onto-canvas pattern (`storeOp: 'discard'`), retired-buffer reclamation post-submit, and the offscreen-capture branch for headless/software adapters that never present the swapchain.
- **Pipeline + shaders** (`wgpuShader.ts`) — `getWgpuPipeline` keyed on `blendMode-stencilMode-format-sampleCount[-depthwrite]`; `getActiveWgpuPipeline` / `getActiveWgpuDepthWritePipeline` resolve the current stencil mode; `BLEND_MODES` maps every fixed-function-expressible `BlendMode` (Add, Alpha, Darken, Erase, Layer, Lighten, Multiply, Normal, Screen, Subtract) with thorough premultiplied-space comments; `requiresWgpuBlendReadback` is the honest predicate for the four destination-read modes (Difference, Hardlight, Invert, Overlay). Bind-group layouts, pipeline layout, matrix→uniform packing, and two uniform writers (`writeWgpuQuadUniforms`, `writeWgpuMatrixOnlyUniforms`).
- **Draw path** (`wgpuDraw.ts`) — `drawWgpuQuad`, `drawWgpuQuadWithTransform` (collapsed onto the single `writeWgpuQuadUniforms` path, alias-safe), texture binding/upload (`bindWgpuTexture`, `createWgpuTextureEntry`, `updateWgpuTextureEntry`) with premultiplied-alpha upload documented, `applyWgpuBlendMode` / `enableWgpuBlendModeSupport`, `getWgpuRenderProxyColorTransform`, `warmWgpuPipelines` (3 stencil × 6 blend = 18 warm pipelines).
- **Offscreen targets** (`wgpuRenderTarget.ts`, `wgpuRenderTargetPool.ts`) — create/destroy/resize, begin/end with a saved-state stack (transform, color format, mask/scissor reset), `rgba16float` HDR format support, Y-flipped result blit, and a pooled target acquire/release.
- **Pass-2 additions** (all present and tested): `wgpuAdapterCapabilities.ts` (`getWgpuAdapterCapabilities`), `wgpuScissor.ts` (push/pop/apply), `wgpuFullscreenPass.ts` (create/destroy/draw), `wgpuShaderRegistry.ts` (`registerWgpuBitmapShader` — confirmed mirror of `render-gl`'s `registerGlBitmapShader`), `wgpuTimestampQuery.ts` (enable/get/destroy + internal encode/schedule), `wgpuRenderStateSignals.ts` (`enableWgpuRenderStateSignals` / `getWgpuRenderStateSignals`, device-lost wired, tree-shaken when unused).
- **Surface readback** (`wgpuSurface.ts`) — frame-capture texture acquire + `copyTextureToBuffer` into a `@flighthq/surface` buffer, the conformance/screenshot path.
- **Types** — new `@flighthq/types` interfaces are all present and well-commented: `WgpuAdapterCapabilities`, `WgpuFullscreenPipeline`, `WgpuRenderStateSignals`, `WgpuRenderStats`, plus the extended `WgpuRenderOptions` (`adapterCapabilities`, `sampleCount`) and `WgpuRenderState` runtime (MSAA, timestamp, signal fields).

Tests: 107 across 16 files (verified by count), jsdom + a `wgpuTestHelper` mock. New primitives each carry a colocated test.

## Gaps

A mature GPU backend core, measured against the AAA bar and `render-gl` as the sibling reference:

- **Separable/destination-read blend modes are predicate-only.** Difference, Hardlight, Invert, Overlay are `null` in `BLEND_MODES` and silently fall back to Normal; only the _detection_ (`requiresWgpuBlendReadback`) ships. No WGSL read-back pass exists. This is a real feature-completeness gap vs. the OpenFL blend-mode target and vs. Canvas's `globalCompositeOperation`.
- **Mipmaps + anisotropy absent.** No `generateWgpuTextureMipmaps`; samplers are linear/nearest with no mip chain or `maxAnisotropy`. Atlas minification quality will suffer. `render-gl` parity and texture-quality completeness both want this.
- **Device-loss recovery is half-built.** The `onDeviceLost` signal fires, but there is no resource-recreation path; `pushErrorScope`/`popErrorScope` OOM guards are absent. The signal is the notification half of a recovery story whose action half does not exist.
- **Timestamp readback has a latent multi-frame hazard.** `scheduleWgpuTimestampReadback` (`wgpuTimestampQuery.ts:95`) calls `mapAsync` every submitted frame with no in-flight guard. If a second frame submits before the prior map resolves, `mapAsync` on an already-pending/mapped buffer rejects (the failure handler swallows it, so the value silently freezes) and in some implementations throws. A single readback buffer + per-frame map needs a "map pending" flag or a small ring of readback buffers.
- **No batched/instanced core draw primitive.** `WgpuQuadBatch` with a growable instance buffer is not in the core (the sprite-batch fields on the runtime are populated by `displayobject-wgpu`, not by a core primitive here). Status correctly flags this as a joint layout decision with the consumers.
- **`onContextResize` is allocated but never emitted** (`wgpuRenderStateSignals.ts`) — a dangling signal with no producer. Either the host or `renderWgpuBackground` (on detected dimension change) must emit it, or it should not be allocated yet.
- **Warm-set is partial by construction.** 18 combinations (1 format, sampleCount=1); HDR (`rgba16float`), MSAA, and depth-write variants compile lazily on first use. A `warmWgpuPipelinesForScene(...)` that takes the scene's actual format/blend/sample set is gestured at but unbuilt.
- **Rust `flighthq-render-wgpu` parity not done.** None of the pass-1/pass-2 surface (feature negotiation, MSAA, timestamps, z-order, signals, expanded warm set) is reflected in the crate, and the divergences (closure→callback/channel, async map→futures/poll) are noted but not recorded in the conformance map.

## Charter contradictions

The charter is a pure stub (all four sections `TODO`), so there is no stated North star, Boundary, or Decision for the code to contradict. **Empty** — and that emptiness is itself the dominant finding: every judgement below is made against the codebase map, not the package's own rubric. See _candidate open directions_.

## Contract & docs fit

**Where the package lives up to the contract:**

- **Types-first.** All cross-package shapes live in `@flighthq/types` (`WgpuAdapterCapabilities`, `WgpuFullscreenPipeline`, `WgpuRenderStateSignals`, `WgpuRenderStats`, runtime/options extensions). No inline cross-package types found.
- **Single root export.** `package.json` exposes only `"."`; `index.ts` is a thin barrel. `sideEffects: false`. No top-level registration — `enable*`/`register*`/`create*` gate every effect.
- **Full unabbreviated names.** Every export carries the `Wgpu` type word (`getWgpuAdapterCapabilities`, `drawWgpuFullscreenPass`, `enableWgpuTimestampQueries`, …).
- **Sentinels not throws** for expected-failure paths (`getWgpuFrameGpuTime` → -1; `getWgpuRenderStateSignals` → null; scissor/fullscreen no-op on null pass). `createWgpuRenderState` throws only for genuine environment misuse (no WebGPU, no adapter/context) — defensible as programmer/environment error.
- **Teardown verbs** correct: `destroyWgpuRenderState` / `destroyWgpuRenderTarget` / `destroyWgpuTimestampQueryResources` free GPU resources; `destroyWgpuFullscreenPipeline` is an honest documented no-op kept for symmetry. `release`/pool brackets in the target pool.
- **Out-param alias-safety** is deliberately handled (`drawWgpuQuadWithTransform`, `drawWgpuRenderTargetResult` read inputs into locals first, with comments).
- **Opt-in signals** via `enableWgpuRenderStateSignals` using `@flighthq/signals` `createSignal` — matches the SDK signal-group pattern; tree-shaken when unused.

**Where the contract/admin docs (or the package) are mis-fitted — candidate revisions:**

- **`@flighthq/displayobject` is a mis-declared dependency.** It appears only in _test_ files (`createBitmap` in `wgpuDraw.test.ts`, `wgpuShaderBinding.test.ts`) yet sits in `dependencies`, not `devDependencies`. For a backend core the Rust map describes as "subject-agnostic GPU plumbing," a runtime dependency on a _subject_ package is a layering inversion (`displayobject-wgpu` should depend on `render-wgpu`, never the reverse). This is a candidate `packages:check`/manifest fix and worth confirming the dependency is genuinely test-only.
- **`Signal<(args) => void>` listener-function form vs. the Rust payload form.** `WgpuRenderStateSignals` types its signals as `Signal<(info) => void>` / `Signal<(w, h) => void>`. This matches the TS `Signal<T>` convention but diverges from the Rust map's "`Signal<T>` parameterized by _payload_" rule; the multi-arg `onContextResize` (`width, height`) will not map cleanly to a single payload struct on the Rust side. A candidate conformance-map note, not a TS defect.
- **Package Map silence.** The codebase-map Package Map does not list `render-wgpu` (nor `render-gl`, `displayobject-wgpu`, etc.) as entries — the render reorg's `<subject>-<backend>` layering is documented in the Rust map but the TS Package Map still reads "render-canvas/-dom/-webgl." Candidate revision: add the wgpu/gl cores and the `<subject>-<backend>` leaves to the TS Package Map.

**Cleanliness / minor (within-file, sweep-safe):**

- `drawWgpuFullscreenPass` (`wgpuFullscreenPass.ts:106`): `const pass = dest !== null ? runtime.renderPass : runtime.renderPass;` — both ternary branches are identical, and `runtime2` is re-fetched (`getWgpuRenderStateRuntime` called twice). Dead branch + redundant fetch; the `dest` parameter is effectively ignored (the function always draws into the current open pass).

## Candidate open directions

The charter answered none of these; each is an assumption this review had to make and should feed the charter's Open directions:

1. **What is render-wgpu's boundary vs. `displayobject-wgpu` / `scene-wgpu` / `filters-wgpu` / `effects-wgpu`?** Scissor, fullscreen-pass, and shader-registry primitives ship here but are wired by the leaf packages. The core/leaf cut (which primitives belong in the subject-agnostic core vs. the per-subject renderer) is the central undecided question and should be the charter's North star. (Touches structural fork A: source-data vs. graph-participation; and fork D: the runtime backend seam.)
2. **Does the core own a batched/instanced draw primitive (`WgpuQuadBatch`), and what is the shared instance-buffer layout?** A cross-package design decision with `displayobject-wgpu`/`scene-wgpu` consumers — surfaced, not assumed.
3. **Cross-backend tolerance for separable blend modes.** Is "close enough" to Canvas `globalCompositeOperation` / WebGL acceptable, or does the parity spec require bit-exact matching? This gates the read-back path implementation.
4. **Should offscreen `createWgpuRenderTarget` support `sampleCount` (MSAA filter targets)?** Today only the main canvas pass is MSAA-capable; the pool would need to match on sample count.
5. **Who emits `onContextResize`** — the host (owns the canvas resize event) or `renderWgpuBackground` (detects dimension change)? Until decided, the signal is allocated dead.
6. **Is the Rust signal/async divergence (closure→channel, `mapAsync`→futures/poll) a blessed conformance-map entry**, or should the TS seam be reshaped (e.g. payload-struct signals) to keep the crates 1:1?
