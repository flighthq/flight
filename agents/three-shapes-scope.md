# Three approved shapes: interaction dispatch layers, effect capture geometry, GPU draw seam

## 1. Interaction dispatch layers

Package: @flighthq/interaction, @flighthq/types

Add a composable layer system between hit-test target resolution and Flight's bubble dispatch. Multiple layers stack by priority; each receives the resolved target and decides whether dispatch proceeds.

### API

```ts
// @flighthq/interaction
connectInteractionDispatchLayer(
  manager: InteractionManager,
  layer: InteractionDispatchLayer,
  options?: { priority?: number },
) → () => void  // returns disconnect function

// @flighthq/types
type InteractionDispatchLayer<N> = (
  target: N,
  name: InteractionSignalName,
  data: Readonly<PointerEventData>,
) => boolean;  // true = pass through; false = suppress
```

### Behavior

- Layers are walked in priority order (highest first) between `findInteractionTarget` and `emitInteractionSignal`.
- If any layer returns `false`, Flight's bubble dispatch is suppressed. The consumer owns routing from that point.
- If all layers return `true` (or no layers are installed), Flight proceeds with its normal bubble traversal.
- The disconnect function removes the layer. Idempotent.
- When no layers are installed, the dispatch path is unchanged — zero cost (no array walk, no function call).

### What changes in the dispatch functions

Every `dispatchInteraction*` function (pointerDown, pointerUp, pointerMove, click, doubleClick, rollover) gets the same insertion point after `setPointerData` and before `emitInteractionSignal`:

```
findInteractionTarget → setPointerData → [walk layers] → emitInteractionSignal
```

The layer walk is a simple priority-ordered array iteration. If the array is null/empty (default), skip it entirely.

### Storage

A `dispatchLayers` field on `InteractionManager` (or on its runtime), typed as an array of `{ layer, priority }` entries sorted by priority descending. Null when empty (no allocation until first `connectInteractionDispatchLayer` call).

---

## 2. Effect capture geometry helper

Package: @flighthq/effects (or @flighthq/effects-gl — determine the right home based on whether it needs the render state or is pure geometry)

A helper that computes the capture geometry for applying effects to a node — bounds, padding, target size, and capture transform — without touching textures or performing any allocation beyond the out parameter.

### API

```ts
// Type for the out parameter
interface RenderEffectCaptureGeometry {
  bounds: Rectangle;           // root-local bounds of the source node
  padding: RenderEffectPadding; // per-side padding from the effect chain
  targetWidth: number;          // texture target width (bounds + padding)
  targetHeight: number;         // texture target height (bounds + padding)
  captureTransform: Matrix;     // the transform to set on the offscreen state
}

// The helper
computeRenderEffectCaptureGeometry(
  out: RenderEffectCaptureGeometry,
  state: RenderState,    // needed for padding resolution (registries)
  source: NodeAny,
  effects: ReadonlyArray<Readonly<RenderEffect>>,
): boolean  // false if source has empty bounds
```

### What it replaces

The caller's manual sequence of:
1. `computeNodeRootLocalBoundsRectangle(bounds, source)`
2. `computeRenderEffectPadding(state, effects)`
3. `computeRenderTargetSize(size, bounds, padding)`
4. `computeScene2DRenderTargetTransform(transform, source, bounds, padding.left, padding.top)`

becomes:

```ts
if (!computeRenderEffectCaptureGeometry(out, state, source, effects)) return;
```

### What stays with the caller

- Texture acquisition (`acquireGlRenderTexture` × 3) — the caller sees the allocations
- Rendering into the source texture (`renderIntoGlRenderTexture`)
- Applying effects (`applyGlRenderEffectsToRenderTexture`)
- Releasing textures
- Composing the result

The out parameter follows Flight's convention: caller-allocated, function-filled, reusable across frames. The `bounds`, `padding`, and `captureTransform` fields inside the out parameter are also caller-allocated (part of the out structure) — no internal allocation.

If this can be implemented without needing a render state (just the padding registries), it belongs in @flighthq/effects. If it needs the full render state, it belongs in the backend-specific packages.

---

## 3. Immediate-mode GPU draw seam

Package: @flighthq/render-gl (promote existing contract exports to public surface)

Promote a curated subset of existing contract-level GL draw primitives to the public `index.ts` export. These already exist, are tested, and are used by other @flighthq/* packages. The work is promotion + any documentation/type adjustments needed for public consumers.

### Functions to promote

State safety:
- `pushGlRenderState(state)` — saves full GL fixed-function state
- `popGlRenderState(state)` — restores it
- `withGlRenderState(state, callback)` — bracket with try/finally
- `invalidateGlRenderStateCache(state)` — reset cached bindings after foreign GL calls

Render pass:
- `beginGlRenderPass(state, target, preserve?, viewport?)` — bind framebuffer, set viewport/scissor, clear
- `endGlRenderPass(state)` — restore and resolve MSAA

Draw helpers:
- `compileGlFullscreenProgram(gl, fragmentSource)` — compile a custom fragment shader
- `drawGlFullscreenPass(state, program, inputs, dest, setUniforms)` — fullscreen quad with custom shader + uniform callback
- `drawGlQuad(state, x0, y0, x1, y1, u0, v0, u1, v1)` — single textured quad, immediate draw

State helpers:
- `applyGlBlendMode(state, blendMode)` — blend mode application with cache

### What is NOT promoted

- `useGlProgram` — too tightly coupled to Flight's internal shader cache
- `setGlAttributes` / `setGlBaseUniforms` / `setGlMatrixFromTransform` — hardcoded to Flight's internal vertex layout
- `bindGlTextureRealization` — operates on Flight's internal texture realization type, not raw WebGLTexture

The state bracket (`withGlRenderState`) is the key export. It makes raw WebGL safe alongside Flight's renderer. Inside the bracket, the caller can use Flight's draw helpers or their own WebGL calls — both work. The bracket saves and restores everything.

---

## Verification for all items

Each item: `npm run fix`, relevant `npm run check <package>`, `npm run test <package>`, `npm run exports:check`, `npm run api:check`, `npm run order`, `npm run size`.

Item 3 (GL draw seam) additionally needs `npm run reachability:check` since it changes the public export surface of render-gl.
