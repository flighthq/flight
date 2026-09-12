# Render Target & Pass Architecture

**Status: unratified (2026-09-12 design session).** Redesigns the render target type hierarchy, introduces a screen render target, formalizes render passes as pooled handles, removes the `render*Background` family, and removes `backgroundColor` from RenderState. Supersedes the target/clear portion of [`render-architecture.md`](render-architecture.md); the rest of that doc (package taxonomy, naming, data atoms) is unaffected.

## Motivation

The GL backend migrated clear from stored-on-target `clearColors`/`clearDepth` to explicit per-pass `RenderTargetClear` descriptors with float RGBA. Canvas and WGPU followed. `RenderPassPreserve` is deleted. The three bedrock primitives — **Target** (pure storage), **Clear** (GPU state write), **Fill** (draw call) — are now the only clear path.

But the screen (default framebuffer / primary canvas) has no render target identity. `renderGlBackground`, `renderCanvasBackground`, and `renderDomBackground` are bespoke per-backend functions that bypass the target+clear+fill model. The screen should participate in the same pass architecture as offscreen targets.

## Decisions

### 1. Render target type hierarchy

A shared base type carries what pass functions need (bind + clear). Subtypes carry capability-specific fields.

```
GlRenderTarget (base: Entity)
├── gl: GlContext
├── framebuffer: WebGLFramebuffer | null
├── width, height
├── colorAttachments: number
├── colorSpace: RenderTargetColorSpace
│
├── GlScreenRenderTarget
│   framebuffer: null (always)
│   colorAttachments: 1 (always)
│   No textures, no resolve, no format arrays, no depth texture.
│   Lifetime: lives as long as the context.
│   Width/height synced from drawingBufferWidth/drawingBufferHeight.
│
└── GlTextureRenderTarget (current GlRenderTarget, renamed)
    framebuffer: WebGLFramebuffer
    textures: WebGLTexture[]
    texture: WebGLTexture (attachment 0)
    resolveFramebuffer: WebGLFramebuffer | null
    depthTexture: WebGLTexture | null
    colorRenderbuffers: WebGLRenderbuffer[]
    depthStencilRenderbuffer: WebGLRenderbuffer | null
    format, colorFormats, depth, sampleCount, requestedAxes
```

Same structure for WGPU: `WgpuRenderTarget` (base), `WgpuScreenRenderTarget`, `WgpuTextureRenderTarget`.

`GlCubeRenderTarget` stays separate — it has its own `beginGlCubeRenderFace`/`endGlCubeRenderFace` pair and does not go through `beginGlRenderPass`.

**Why separate types:** you can sample a `GlTextureRenderTarget` (read its `texture` in a shader, present it, use it as an effect input). You cannot sample a `GlScreenRenderTarget` — the default framebuffer has no sampleable texture handle. If they share a type, `target.texture` exists on screen targets where it is meaningless, and functions like `presentGlRenderTarget` or `drawGlRenderTargetResult` would silently accept a screen target and read a bogus field. The type split makes sampling a compile-time constraint.

**Pass functions accept the base:** `beginGlRenderPass(state, target: GlRenderTarget, clear?)` works with both. Sampling/present functions accept only `GlTextureRenderTarget`.

**Clear loop fix:** the broadcast-color clear path currently iterates `target.textures.length`. With the base type, it iterates `target.colorAttachments` — the declared count, not the storage array length. This is correct for both screen (1 color attachment, no textures array) and offscreen (colorAttachments === textures.length).

### 2. Screen target and render state are independent — both take the driver handle

The screen render target and render state are conceptually independent. Neither is derived from the other. Both take the driver handle directly:

```typescript
// GL
const gl = canvas.getContext('webgl2');
const screen = createGlScreenRenderTarget(gl);    // "which screen" — holds gl for identity
const state = createGlRenderState(gl, pipeline);  // "how to talk to the GPU" — holds gl for operations

// WGPU
const device = await adapter.requestDevice();
const screen = createWgpuScreenRenderTarget(device, canvas);  // holds GPUCanvasContext
const state = createWgpuRenderState(device, pipeline);

// Canvas 2D — inherently web-only, no portability suffix needed
const screen = createCanvasScreenRenderTarget(canvas);  // holds CanvasRenderingContext2D
const state = createCanvasRenderState(pipeline);
```

Context acquisition (`canvas.getContext(...)`, `navigator.gpu.requestAdapter()`) is the caller's one-liner, not an SDK function. This keeps the SDK entry point portable: `createGlScreenRenderTarget(gl: GlContext)` has a direct C++ equivalent taking the native GL context handle, while a function taking `HTMLCanvasElement` would not. Canvas methods use the `Canvas` prefix, which already declares web-only — no `FromCanvasElement` suffix.

**Why the screen target holds the driver handle:** in a multiwindow scenario, each screen target must identify *which* default framebuffer / swap chain surface to bind. For GL, `gl` IS the default framebuffer identity (one context = one default framebuffer). For WGPU, `GPUCanvasContext` identifies the swap chain surface (one `GPUDevice` can target multiple canvases). For Canvas 2D, `CanvasRenderingContext2D` identifies the canvas. The handle is the screen's identity across all backends.

**Why the render state also holds the driver handle:** the state needs the driver handle for GPU operations that happen outside any pass — shader compilation, texture upload, renderer registration. The state does not hold or reference a render target; the target flows in at `beginRenderPass` time.

Context state (`GlContextState`, `GlContextRuntime`) is built internally by `createGlRenderState` — the user never sees or creates it.

### 3. Render pass as a pooled handle

`beginGlRenderPass` returns a pass handle. The pass is the drawing bracket — you draw into it, not into the state.

```typescript
const pass = beginGlRenderPass(state, screen, { color: [0.1, 0.1, 0.18, 1.0] });
renderGlScene2D(pass, root);
endGlRenderPass(pass);
```

The pass handle carries the state, the active target, the viewport, and the saved previous state for restoration. It is pooled — acquired on begin, returned on end. Using it after end is a bug (same contract as any acquire/release bracket).

**Pass ordering:** a target can have at most one open pass. Starting a new pass on the same target requires the previous to have ended. Nesting is cross-target only (an offscreen pass inside a suspended screen pass).

**DOM does not participate.** DOM is retained-mode — it manipulates elements via style/transform properties, not framebuffer commands. `renderDomScene2D(state, root)` keeps its current signature. The pass model applies to GL and WGPU (and Canvas 2D as a web-only emulation). The prefixes make this honest.

### 4. `backgroundColor` removed from RenderState

`backgroundColor`, `backgroundColorRgba`, and `backgroundColorString` are removed from the `RenderState` base type. The background is what you clear to — a per-pass clear descriptor, not a state property.

```typescript
// Before
const state = createGlRenderState(gl, pipeline, { backgroundColor: 0x1a1a2eff });
renderGlBackground(state);

// After
const pass = beginGlRenderPass(state, screen, { color: [0.1, 0.1, 0.18, 1.0] });
```

The effects pipelines (`beginGlRenderEffectPipeline`, `beginWgpuRenderEffectPipeline`) currently read `state.backgroundColorRgba` to clear their scene target. After this change, they accept the clear color as a parameter instead. The only WGPU callsite reads it as a convenience; GL already clears to transparent black and ignores it.

For DOM, the background is a CSS property on the element — set it directly: `state.element.style.backgroundColor = '#1a1a2e'`. No `renderDomBackground` function.

### 5. `render*Background` family deleted

- `renderGlBackground` — already deleted (this session). Replaced by `beginGlRenderPass` with a clear descriptor on the screen target.
- `renderCanvasBackground` — deleted. Its compositing/transform reset (blend mode, alpha, transform) moves into `beginCanvasRenderPass` (it is context-state invalidation, same job as `invalidateGlPassBindingCache`). The clear (`fillRect`/`clearRect`) is the pass's clear descriptor.
- `renderDomBackground` — deleted. The one-liner CSS property assignment (`element.style.backgroundColor`) is the caller's responsibility, not a rendering function.

### 6. Canvas 2D is web-only

`CanvasRenderingContext2D` does not exist in C++. The portable render path is GL and WGPU. Canvas 2D and DOM are `host-web` concerns — host adaptations of the rendering model. The target/pass architecture is designed around the portable GPU path; Canvas 2D emulates it where it can (`clearRect` ≈ clear, context swap ≈ framebuffer bind), but it is not the design center.

Canvas 2D has a structural difference from GL/WGPU: each canvas element has its own `CanvasRenderingContext2D`, so swapping targets physically swaps the context. GL and WGPU have one context with bindable targets. `beginCanvasRenderPass` swaps the active context on the state and invalidates the binding shadow (`currentAlpha`, `currentBlendMode`, smoothing). This is internal — the pass handle abstracts it.

### 8. Web convenience functions move to `host-web`; render packages become web-type-free

Portable render packages (`render-gl`, `render-wgpu`) must not reference web types (`HTMLCanvasElement`, `document`, etc.). Web-only convenience functions move to `host-web`, following its `web*` prefix convention:

- `createGlContextFromCanvasElement` → `createWebGlContext(canvas, options)` in `host-web`. Handles default context attributes (stencil, alpha, antialias) and the null-context error. Earns its existence because getting context attributes wrong is a real footgun.
- `createGlCanvasElement` / `createGlRenderSurface` → `createWebCanvasElement(width, height, pixelRatio)` in `host-web`. Handles CSS size vs backing store size (pixel ratio math).
- `createWgpuCanvasElement` → same pattern, moves to `host-web`.

**Deleted entirely — no replacement:**

- `setGlRenderSurfaceProvider` / `setWgpuRenderSurfaceProvider` — module-scoped mutable singletons in `render-gl` and `render-wgpu`. Violate explicit dependency. Zero package-level callers.
- `enableHostWebGlRenderSurface` / `enableHostWebWgpuRenderSurface` — the `host-web` functions that write into those singletons.
- `GlRenderSurfaceProvider` / `WgpuRenderSurfaceProvider` types — the provider interfaces behind the singletons.
- `explainGlRenderSurfaceAbsence` / `getGlRenderSurfaceProvider` / `resetGlRenderSurfaceProviderForTest` — the singleton's diagnostic and test seams.

The entire singleton provider chain (`enableHostWeb*RenderSurface` → `set*RenderSurfaceProvider` → module-scoped `_provider` → `create*RenderSurface`) is replaced by direct functions in `host-web` that callers import explicitly.

**Also deleted:**

- `createGlOffscreenRenderState` — a one-line wrapper around `createGlRenderState` with the same arguments. Under the new model, sharing a context is just passing the same `gl` handle. The "offscreen" distinction no longer exists when no render state owns a screen.

### 9. `gl` on the base render target; target-only operations

The base `GlRenderTarget` holds `gl: GlContext`. The screen target already holds it for identity; the base carries it so target-specific operations need only the target:

- `clearGlRenderTarget(target, clear)` — binds framebuffer, clears. No render state needed.
- `destroyGlRenderTarget(target)` — deletes GPU resources. Currently takes state just as a `gl` proxy.
- `resizeGlRenderTarget(target, w, h)` — reallocates textures. Same.

These are target operations, not render operations. They don't need pipelines, registries, or blend state. With `gl` on the target, they take the target alone.

`gl` is on both the target and the render state for different reasons: the target owns its relationship to the GPU (bind, clear, destroy, resize), the state owns the rendering machinery (shaders, registries, blend). Same handle, different roles.

Clear is available two ways: as the standalone primitive `clearGlRenderTarget(target, clear)`, and as the optional clear descriptor on `beginGlRenderPass(state, target, clear?)`. The pass-begin path is a convenience that clears on bind; the standalone path is the primitive.

### 10. Draw functions take pass; clear and target lifecycle take target

Functions that **draw** (issue draw calls into an active pass) take the pass handle:
- `renderGlScene2D(pass, root)`
- `drawGlScene3D(pass, scene, camera, lights)`
- `fillGlRect(pass, color, rect?)`
- `drawGlTextureRenderTargetResult(pass, source, ...)`

Functions that **operate on a target** (GPU state writes, resource lifecycle) take the target:
- `clearGlRenderTarget(target, clear)`
- `destroyGlRenderTarget(target)`
- `resizeGlRenderTarget(target, w, h)`

`drawGlFullscreenPass` is used in effects pipelines that rapidly ping-pong targets. It manages its own framebuffer binding and takes the destination target directly rather than requiring a caller-managed pass bracket.

### 7. Context vs. context state

Two separate types, both kept internally:

- **Context** (`GlContext`, `GPUDevice`) — the driver handle from the platform. Not an Entity. The user passes this to both `createGl*RenderTarget` and `createGlRenderState`.
- **Context state** (`GlContextState` → `GlContextRuntime`) — Flight's bookkeeping: binding shadow, shared GPU buffers, texture caches. An Entity with a runtime.

`createGlContextState(gl)` still exists as an internal function — `createGlRenderState(gl, pipeline)` calls it to build the tracking layer. The user never sees or creates context state directly. The driver handle is the only GPU-layer input the user provides — it goes to both the screen target (for identity) and the render state (for operations).

## Resulting render loop

```typescript
// ─── Construction: backend-specific, honestly different ───

// GL (web) — createWebGlContext from host-web handles default attributes + null check
const gl = createWebGlContext(canvas);
const screen = createGlScreenRenderTarget(gl);
const state = createGlRenderState(gl, pipeline);
// ...register renderers, texture resolvers, blend support...

// WGPU (web)
const device = await adapter.requestDevice();
const screen = createWgpuScreenRenderTarget(device, canvas);
const state = createWgpuRenderState(device, pipeline);

// Canvas 2D (web-only)
const screen = createCanvasScreenRenderTarget(canvas);
const state = createCanvasRenderState(pipeline);

// DOM (web-only, no target/pass model)
const state = createDomRenderState(element, pipeline);
state.element.style.backgroundColor = '#1a1a2e';

// ─── Render loop: GL and WGPU converge ───

// GL
prepareScene2DRender(state, root);
const pass = beginGlRenderPass(state, screen, { color: [0.1, 0.1, 0.18, 1.0] });
renderGlScene2D(pass, root);
endGlRenderPass(pass);

// WGPU
prepareScene2DRender(state, root);
const pass = beginWgpuRenderPass(state, screen, { color: [0.1, 0.1, 0.18, 1.0] });
renderWgpuScene2D(pass, root);
endWgpuRenderPass(pass);

// Canvas 2D (web-only, emulates the pass model)
prepareScene2DRender(state, root);
const pass = beginCanvasRenderPass(state, screen, { color: [0.1, 0.1, 0.18, 1.0] });
renderCanvasScene2D(pass, root);
endCanvasRenderPass(pass);

// DOM (no pass bracket)
prepareScene2DRender(state, root);
renderDomScene2D(state, root);
```

## Migration scope

| Change | Scope |
|---|---|
| Rename `GlRenderTarget` → `GlTextureRenderTarget` | All files referencing the type (types, render-gl, scene2d-gl, scene3d-gl, effects-gl, tests) |
| Rename `WgpuRenderTarget` → `WgpuTextureRenderTarget` | All files referencing the type (types, render-wgpu, scene2d-wgpu, effects-wgpu, tests) |
| New `GlRenderTarget` base type | types |
| New `GlScreenRenderTarget` / `WgpuScreenRenderTarget` | types, render-gl, render-wgpu |
| Screen target creation (takes driver handle directly) | render-gl, render-wgpu, scene2d-canvas |
| Pass handle type + pooling | render-gl, render-wgpu, scene2d-canvas |
| Draw functions take pass instead of state | scene2d-gl, scene2d-wgpu, scene2d-canvas, scene3d-gl, scene3d-wgpu, effects-* |
| Remove `backgroundColor` from RenderState | types, render (base), all backends, all examples/tools |
| Delete `renderGlBackground` | done |
| Delete `renderCanvasBackground` | scene2d-canvas |
| Delete `renderDomBackground` | scene2d-dom |
| Update tools/examples render loops | ~120 files (mechanical) |
| Context state internalized | render-gl, render-wgpu (creation path changes) |
| `clearGlRenderPass` uses `colorAttachments` not `textures.length` | render-gl |
| Delete `createGlOffscreenRenderState` | render-gl, callers use `createGlRenderState(gl, pipeline)` |
| Move `createGlContextFromCanvasElement` → `createWebGlContext` | render-gl → host-web |
| Move `createGlCanvasElement` / `createGlRenderSurface` → `createWebCanvasElement` | render-gl → host-web |
| Move `createWgpuCanvasElement` → `createWebWgpuCanvasElement` | render-wgpu → host-web |
| Delete singleton provider chain | render-gl, render-wgpu, host-web (`set*RenderSurfaceProvider`, `enable*`, `GlRenderSurfaceProvider`, `WgpuRenderSurfaceProvider`) |

## Open questions

None — all decisions are settled in the session above. The fleet implements against this spec.
