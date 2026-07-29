import { copyMatrix, createMatrix } from '@flighthq/geometry/contract';
import type {
  GlRenderState,
  GlRenderTarget,
  GlScissorRect,
  GlViewportRect,
  Matrix,
  RenderPassPreserve,
  Viewport,
} from '@flighthq/types/contract';

import { getGlRenderStateRuntime } from './glRenderState';
import { resolveGlRenderTarget } from './glRenderTarget';

type SavedGlPass = {
  framebuffer: WebGLFramebuffer | null;
  renderTarget: GlRenderTarget | null;
  renderTargetViewport: GlViewportRect | null;
  renderTransform2D: Matrix | null;
  scissorRect: GlScissorRect | null;
  scissorStack: GlScissorRect[];
};

// Begins a render pass into `target`: binds it (saving the previous binding for restore, so passes
// nest), then CLEARS every aspect by default. `preserve` spares aspects — the only per-use decision a
// pass makes; the clear VALUES are fixed on the target (GlRenderTarget.clearColors / clearDepth). Pair
// with endGlRenderPass. This is the clear/preserve model, not GL/Vulkan load ops: omit `preserve` and
// everything starts fresh; name what to keep.
//
// `viewport` is a device-pixel, top-left-origin region of `target`. It is intersected with target
// storage, realized as both viewport and scissor, and therefore constrains drawing plus color/depth
// clears without allocating another target. Nested passes cannot escape an enclosing pass scissor.
//
// A render pass carries NO 2D transform — that is a display-object DRAW concern, not a pass concern, so
// a 3D pass (drawGlScene3D, which uses the camera) is unaffected. A 2D pass that needs a specific root
// device transform sets it explicitly with setGlRenderTransform2D after begin; the value is saved and
// restored by the begin/end bracket like the rest of the pass state.
//
// Single-attachment (the common no-effects scene / 2D-offscreen path):
//   beginGlRenderPass(state, target)                       // clear color + depth
//   drawGlScene3D(state, scene, camera, lights)
//   endGlRenderPass(state)                                 // restore binding + resolve MSAA
//   presentGlRenderTarget(state, target)                   // colorSpace-aware encode to the canvas
//
// MRT / G-buffer (three color attachments, keep depth for a later lighting pass over the same target):
//   beginGlRenderPass(state, gbuffer, { preserveColor: [false, false, false], preserveDepth: false })
//   drawGlScene3D(state, scene, camera, lights)              // fragment shader writes location 0,1,2
//   endGlRenderPass(state)
//   // ...lighting pass samples gbuffer.textures[0..2], preserving depth: { preserveDepth: true }
//
// Partial target (clear only the sub-region, then restore the exact enclosing viewport/scissor):
//   beginGlRenderPass(state, target, undefined, viewport)
//   drawGlScene3D(state, scene, camera, lights)
//   endGlRenderPass(state)
export function beginGlRenderPass(
  state: GlRenderState,
  target: GlRenderTarget,
  preserve?: Readonly<RenderPassPreserve>,
  viewport?: Readonly<Viewport>,
): void {
  const runtime = getGlRenderStateRuntime(state);
  const gl = state.gl;

  let stack = _passStack.get(state);
  if (stack === undefined) {
    stack = [];
    _passStack.set(state, stack);
  }
  stack.push({
    framebuffer: runtime.currentFramebuffer,
    renderTarget: runtime.currentRenderTarget ?? null,
    renderTargetViewport: runtime.renderTargetViewport,
    renderTransform2D: state.renderTransform2D,
    scissorRect: runtime.currentScissorRect ?? null,
    scissorStack: [...(runtime.scissorStack ?? [])],
  });

  const activeViewport = resolveGlPassViewport(target, viewport);
  const enclosingScissor = runtime.currentScissorRect ?? null;
  const activeScissor =
    enclosingScissor === null
      ? viewport === undefined
        ? null
        : activeViewport
      : intersectGlRects(enclosingScissor, activeViewport);

  gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
  gl.viewport(activeViewport.x, activeViewport.y, activeViewport.width, activeViewport.height);
  runtime.currentFramebuffer = target.framebuffer;
  runtime.currentRenderTarget = target;
  runtime.renderTargetViewport = activeViewport;
  runtime.currentScissorRect = activeScissor;
  runtime.scissorStack = activeScissor === null ? [] : [activeScissor];
  applyGlScissor(gl, activeScissor);
  // Force rebind on next draw — the framebuffer switch invalidates GL state assumptions.
  runtime.currentTexture = null;
  runtime.currentBlendMode = null;

  clearGlRenderPass(state, target, preserve);
}

// Ends the pass opened by beginGlRenderPass: restores the framebuffer binding, exact viewport/scissor,
// clip stack, and 2D render transform saved at begin, then resolves MSAA on the target that was active
// (a store-side property of the pass). Afterward that target's textures hold the finished,
// single-sample result — ready for present, effects, or sampling. A call with no matching begin is a
// no-op. The target is read from runtime rather than passed, so end mirrors the other backend brackets.
export function endGlRenderPass(state: GlRenderState): void {
  const runtime = getGlRenderStateRuntime(state);
  const gl = state.gl;

  const ended = runtime.currentRenderTarget ?? null;
  const saved = _passStack.get(state)?.pop();
  if (saved !== undefined) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, saved.framebuffer);
    const viewport = saved.renderTargetViewport;
    gl.viewport(
      viewport?.x ?? 0,
      viewport?.y ?? 0,
      viewport?.width ?? state.canvas.width,
      viewport?.height ?? state.canvas.height,
    );
    runtime.currentFramebuffer = saved.framebuffer;
    runtime.currentRenderTarget = saved.renderTarget;
    runtime.renderTargetViewport = saved.renderTargetViewport;
    runtime.currentScissorRect = saved.scissorRect;
    runtime.scissorStack = saved.scissorStack;
    applyGlScissor(gl, saved.scissorRect);
    state.renderTransform2D = saved.renderTransform2D;
    runtime.currentTexture = null;
    runtime.currentBlendMode = null;
  }

  if (ended !== null) resolveGlRenderTarget(state, ended);
}

// Sets the 2D root device transform the display-object update pass (prepareScene2DRender) reads to
// place nodes with no scene parent. Call after beginGlRenderPass when a 2D pass renders into a target
// with its own coordinate system (the render cache); the value is restored by the matching
// endGlRenderPass. A fresh matrix is allocated rather than mutating in place, because the begin/end
// bracket saved the previous reference and restores it — mutating the shared object would corrupt that.
export function setGlRenderTransform2D(state: GlRenderState, transform: Readonly<Matrix>): void {
  const next = createMatrix();
  copyMatrix(next, transform);
  state.renderTransform2D = next;
}

// Clears the bound target's aspects that `preserve` does not spare. Uses per-attachment clearBufferfv so
// each color attachment can carry its own clear value (the G-buffer case) and preserved attachments are
// skipped individually — the plain single-attachment case is just the one-iteration loop.
function clearGlRenderPass(
  state: GlRenderState,
  target: Readonly<GlRenderTarget>,
  preserve: Readonly<RenderPassPreserve> | undefined,
): void {
  const gl = state.gl;
  const preserveColor = preserve?.preserveColor ?? false;

  for (let i = 0; i < target.textures.length; i++) {
    if (isGlColorAttachmentPreserved(preserveColor, i)) continue;
    resolveGlClearColor(state, target, i, _clearRgba);
    gl.clearBufferfv(gl.COLOR, i, _clearRgba);
  }

  const hasDepth = target.depthStencilRenderbuffer !== null || target.depthTexture !== null;
  if (hasDepth && preserve?.preserveDepth !== true) {
    // depthMask must be enabled or the depth clear is silently dropped.
    gl.depthMask(true);
    gl.clearBufferfi(gl.DEPTH_STENCIL, 0, target.clearDepth, 0);
  }

  getGlRenderStateRuntime(state).currentBlendMode = null;
}

function isGlColorAttachmentPreserved(preserve: boolean | ReadonlyArray<boolean>, index: number): boolean {
  if (typeof preserve === 'boolean') return preserve;
  // Per-location; a missing or short entry defaults to clear (false), consistent with default-clear.
  return preserve[index] === true;
}

// Writes attachment `index`'s clear color into `out` as linear 0..1 RGBA. The target's packed-RGBA
// clearColors win when present; otherwise the render state's background color is the fallback.
function resolveGlClearColor(
  state: GlRenderState,
  target: Readonly<GlRenderTarget>,
  index: number,
  out: Float32Array,
): void {
  const packed = target.clearColors[index];
  if (packed !== undefined) {
    out[0] = ((packed >>> 24) & 0xff) / 255;
    out[1] = ((packed >>> 16) & 0xff) / 255;
    out[2] = ((packed >>> 8) & 0xff) / 255;
    out[3] = (packed & 0xff) / 255;
    return;
  }
  const bg = state.backgroundColorRgba;
  out[0] = bg[0] ?? 0;
  out[1] = bg[1] ?? 0;
  out[2] = bg[2] ?? 0;
  out[3] = bg.length >= 4 ? bg[3] : 0;
}

function applyGlScissor(gl: WebGL2RenderingContext, rect: Readonly<GlScissorRect> | null): void {
  if (rect === null) {
    gl.disable(gl.SCISSOR_TEST);
    return;
  }
  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(rect.x, rect.y, rect.width, rect.height);
}

function intersectGlRects(a: Readonly<GlScissorRect>, b: Readonly<GlViewportRect>): GlScissorRect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const top = Math.min(a.y + a.height, b.y + b.height);
  return {
    height: Math.max(0, top - y),
    width: Math.max(0, right - x),
    x,
    y,
  };
}

function resolveGlPassViewport(
  target: Readonly<GlRenderTarget>,
  viewport: Readonly<Viewport> | undefined,
): GlViewportRect {
  if (viewport === undefined) return { height: target.height, width: target.width, x: 0, y: 0 };

  // Compute both unbounded edges before clamping. Clamping x first and retaining width would turn
  // {-10,width:20} into 20 visible pixels instead of the correct 10-pixel intersection.
  const rawLeft = Math.floor(viewport.x);
  const rawRight = Math.ceil(viewport.x + Math.max(0, viewport.width));
  const rawTop = Math.floor(viewport.y);
  const rawBottom = Math.ceil(viewport.y + Math.max(0, viewport.height));
  const left = clampGlPassEdge(rawLeft, target.width);
  const right = clampGlPassEdge(rawRight, target.width);
  const top = clampGlPassEdge(rawTop, target.height);
  const bottom = clampGlPassEdge(rawBottom, target.height);
  const width = Math.max(0, right - left);
  const height = Math.max(0, bottom - top);
  return {
    height,
    width,
    x: left,
    y: target.height - bottom,
  };
}

function clampGlPassEdge(value: number, extent: number): number {
  return Math.min(extent, Math.max(0, value));
}

// The pass bracket's save/restore stack, keyed off the render state so nested passes restore in order.
const _passStack = new WeakMap<GlRenderState, SavedGlPass[]>();
const _clearRgba = new Float32Array(4);
