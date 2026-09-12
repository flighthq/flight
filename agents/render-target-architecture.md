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

### 2. Screen render target — lazy accessor, context state internal

The screen render target is created via a lazy accessor. Context state is an internal detail, not user-facing.

```typescript
// GL — web entry point (names the web type honestly)
const screen = createGlScreenRenderTargetFromCanvasElement(canvas, {
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
});

// WGPU
const screen = createWgpuScreenRenderTargetFromCanvasElement(canvas);
```

The `FromCanvasElement` suffix marks these as web-specific. `HTMLCanvasElement` is a web type; a portable `createGlScreenRenderTarget` would take a native surface handle, not a DOM element. The naming reserves that space for the C++ port.

Internally, the creation function acquires the GL/WGPU context and creates the context state (`GlContextState`, `GlContextRuntime`). The user never sees these — they are implementation details of the target. The render state is then created from the screen target:

```typescript
const state = createGlRenderState(screen, pipeline);
```

`createGlRenderState` extracts the context from the screen target internally. One fewer noun for the user: no `createGlContextState`, no `createGlContextFromCanvasElement`.

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
const state = createGlRenderState(contextState, pipeline, { backgroundColor: 0x1a1a2eff });
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

### 7. Context vs. context state

Two separate types, both kept:

- **Context** (`GlContext`, `GPUDevice`) — the driver handle from the platform. Not an Entity.
- **Context state** (`GlContextState` → `GlContextRuntime`) — Flight's bookkeeping: binding shadow, shared GPU buffers, texture caches. An Entity with a runtime.

`createGlContext*` cannot return an Entity-with-runtime because the name reads as "create a WebGL context." The wrapper earns its name precisely because it is not the context: `createGlContextState(gl)` says "take this context and build the state tracking around it."

Context state is internal to the screen render target creation. The user does not create or reference it directly.

## Resulting render loop

```typescript
// ─── Construction: backend-specific, honestly different ───

// GL (web)
const screen = createGlScreenRenderTargetFromCanvasElement(canvas, { ... });
const state = createGlRenderState(screen, pipeline);
// ...register renderers, texture resolvers, blend support...

// WGPU (web)
const screen = createWgpuScreenRenderTargetFromCanvasElement(canvas);
const state = createWgpuRenderState(screen, pipeline);

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
| Screen target creation functions | render-gl, render-wgpu, scene2d-canvas |
| Pass handle type + pooling | render-gl, render-wgpu, scene2d-canvas |
| Draw functions take pass instead of state | scene2d-gl, scene2d-wgpu, scene2d-canvas, scene3d-gl, scene3d-wgpu, effects-* |
| Remove `backgroundColor` from RenderState | types, render (base), all backends, all examples/tools |
| Delete `renderGlBackground` | done |
| Delete `renderCanvasBackground` | scene2d-canvas |
| Delete `renderDomBackground` | scene2d-dom |
| Update tools/examples render loops | ~120 files (mechanical) |
| Context state internalized | render-gl, render-wgpu (creation path changes) |
| `clearGlRenderPass` uses `colorAttachments` not `textures.length` | render-gl |

## Open questions

None — all decisions are settled in the session above. The fleet implements against this spec.
