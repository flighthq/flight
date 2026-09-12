import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { copyMatrix, createMatrix } from '@flighthq/geometry/contract';
import type {
  GlContext,
  GlRenderPass,
  GlRenderState,
  GlRenderTarget,
  GlScissorRect,
  GlTextureRenderTarget,
  GlViewportRect,
  Matrix,
  RenderTargetClear,
  Viewport,
} from '@flighthq/types/contract';

import { getGlRenderStateRuntime } from './glRenderState';
import { resolveGlTextureRenderTarget } from './glRenderTarget';

type SavedGlPassState = {
  clipForms: ('rect' | 'contour')[];
  currentMaskDepth: number;
  framebuffer: WebGLFramebuffer | null;
  renderTarget: ReturnType<typeof getGlRenderStateRuntime>['currentRenderTarget'];
  renderTargetViewport: GlViewportRect | null;
  renderTransform2D: Matrix | null;
  scissorRect: GlScissorRect | null;
  scissorStack: GlScissorRect[];
};

type GlPassStackEntry = {
  depthMask: boolean;
  owner: GlRenderState;
  ownerState: SavedGlPassState;
  previousOwner: GlRenderState;
  previousState: SavedGlPassState;
  stencil: SavedGlStencil | null;
};

type SavedGlStencil = {
  fail: number;
  func: number;
  passDepthFail: number;
  passDepthPass: number;
  ref: number;
  valueMask: number;
  writeMask: number;
};

// Begins a render pass into `target`: binds it (saving the previous binding for restore, so passes
// nest). Aspects named in `clear` are overwritten to the given values; omitted aspects are preserved.
// Pair with endGlRenderPass.
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
//   beginGlRenderPass(state, target, { color: [0, 0, 0, 0], depth: 1.0 })
//   drawGlScene3D(state, scene, camera, lights)
//   endGlRenderPass(state)
//   presentGlRenderTarget(state, target)
//
// Partial target (clear only the sub-region, then restore the exact enclosing viewport/scissor):
//   beginGlRenderPass(state, target, { color: [0, 0, 0, 0] }, viewport)
//   drawGlScene3D(state, scene, camera, lights)
//   endGlRenderPass(state)
export function beginGlRenderPass(
  state: GlRenderState,
  target: GlRenderTarget,
  clear?: Readonly<RenderTargetClear>,
  viewport?: Readonly<Viewport>,
): GlRenderPass {
  const gl = state.gl;
  let stack = _passStack.get(gl);

  // One WebGL context has one live framebuffer/stencil/scissor state even when several higher-level
  // GlRenderStates share it (the render-cache path). The top context-owned pass is therefore the
  // physical enclosing state; the incoming state's dormant runtime is only its local restore point.
  const previousOwner = stack?.at(-1)?.owner ?? state;
  const previousRuntime = getGlRenderStateRuntime(previousOwner);
  const previousState = captureGlPassState(previousOwner);
  const currentMaskDepth = previousState.currentMaskDepth;
  if (currentMaskDepth > 0 && previousState.framebuffer === target.framebuffer) {
    throw new Error('beginGlRenderPass: cannot nest the active framebuffer while a contour clip is live');
  }

  if (stack === undefined) {
    stack = [];
    _passStack.set(gl, stack);
  }
  stack.push({
    depthMask: gl.getParameter(gl.DEPTH_WRITEMASK) !== false,
    owner: state,
    ownerState: previousOwner === state ? previousState : captureGlPassState(state),
    previousOwner,
    previousState,
    stencil: currentMaskDepth > 0 ? captureGlStencil(gl) : null,
  });

  const runtime = getGlRenderStateRuntime(state);
  const activeViewport = resolveGlPassViewport(target, viewport);
  const enclosingScissor = previousState.scissorRect;
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
  // A pass owns its logical 2D clip unwind state. Inheriting the enclosing entries would let
  // renderGlScene2D.finalize pop clips it did not push, desynchronizing the logical and hardware
  // stacks after the enclosing pass is restored.
  runtime.clipForms = [];
  runtime.currentMaskDepth = 0;
  applyGlScissor(gl, activeScissor);
  // Stencil clips belong to the framebuffer where they were rasterized. Disable the enclosing gate
  // while the nested pass owns a different logical clip stack; end restores its exact steady state.
  if (currentMaskDepth > 0) gl.disable(gl.STENCIL_TEST);
  // Force rebind on next draw — the framebuffer switch invalidates GL state assumptions.
  invalidateGlPassBindingCache(runtime);
  if (previousOwner !== state) invalidateGlPassBindingCache(previousRuntime);

  clearGlRenderPass(state, target, clear);

  return acquireGlRenderPassHandle(gl, state, target);
}

// Ends the pass opened by beginGlRenderPass: restores the framebuffer binding, exact viewport/scissor,
// clip stack, and 2D render transform saved at begin, then resolves MSAA on the target that was active
// (a store-side property of the pass). Afterward that target's textures hold the finished,
// single-sample result — ready for present, effects, or sampling. A call with no matching begin throws:
// an unbalanced pass is a programmer error, and silently accepting it hides a leaked prior pass. The
// target is read from runtime rather than passed, so end mirrors the other backend brackets.
export function endGlRenderPass(passOrState: GlRenderPass | GlRenderState): void {
  const state = isGlRenderPass(passOrState) ? passOrState.state : passOrState;
  const gl = state.gl;
  const stack = _passStack.get(gl);
  if (stack === undefined) {
    throw new Error('endGlRenderPass called without a matching beginGlRenderPass');
  }
  const saved = stack.at(-1);
  if (saved === undefined || saved.owner !== state) {
    throw new Error('endGlRenderPass called without a matching beginGlRenderPass');
  }
  stack.pop();
  if (stack.length === 0) _passStack.delete(gl);
  if (isGlRenderPass(passOrState)) releaseGlRenderPassHandle(gl, passOrState);

  const runtime = getGlRenderStateRuntime(state);
  // This bracket installs only GlRenderTarget; a restored outer target may be a cube target, but the
  // target being ended here is always the 2D/MSAA target beginGlRenderPass installed.
  const ended = runtime.currentRenderTarget as GlTextureRenderTarget | null;
  restoreGlPassState(state, saved.ownerState);

  gl.bindFramebuffer(gl.FRAMEBUFFER, saved.previousState.framebuffer);
  const viewport = saved.previousState.renderTargetViewport;
  gl.viewport(
    viewport?.x ?? 0,
    viewport?.y ?? 0,
    viewport?.width ?? saved.previousOwner.gl.drawingBufferWidth,
    viewport?.height ?? saved.previousOwner.gl.drawingBufferHeight,
  );
  applyGlScissor(gl, saved.previousState.scissorRect);
  restoreGlStencil(gl, saved.stencil);
  gl.depthMask(saved.depthMask);

  invalidateGlPassBindingCache(runtime);
  if (saved.previousOwner !== state) {
    invalidateGlPassBindingCache(getGlRenderStateRuntime(saved.previousOwner));
  }

  if (ended !== null) resolveGlTextureRenderTarget(saved.previousOwner, ended);
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
  // The root device transform is an input to every prepared proxy transform, but it is state policy,
  // not a node revision. Mark the state-local proxies stale so a repeated offscreen capture with new
  // bounds/padding cannot reuse transforms prepared for the previous target dimensions.
  const runtime = getGlRenderStateRuntime(state);
  for (const source of runtime.renderProxySources) {
    const proxy = runtime.renderProxyMap.get(source);
    if (proxy !== undefined) proxy.lastLocalTransformId = -1;
  }
}

function clearGlRenderPass(
  state: GlRenderState,
  target: Readonly<GlRenderTarget>,
  clear: Readonly<RenderTargetClear> | undefined,
): void {
  if (clear === undefined) return;

  const gl = state.gl;
  const { color, colors, depth, stencil } = clear;

  if (colors !== undefined) {
    for (let i = 0; i < colors.length; i++) {
      const rgba = colors[i];
      if (rgba === undefined) continue;
      _clearRgba[0] = rgba[0];
      _clearRgba[1] = rgba[1];
      _clearRgba[2] = rgba[2];
      _clearRgba[3] = rgba[3];
      gl.clearBufferfv(gl.COLOR, i, _clearRgba);
    }
  } else if (color !== undefined) {
    _clearRgba[0] = color[0];
    _clearRgba[1] = color[1];
    _clearRgba[2] = color[2];
    _clearRgba[3] = color[3];
    for (let i = 0; i < target.colorAttachments; i++) {
      gl.clearBufferfv(gl.COLOR, i, _clearRgba);
    }
  }

  if (depth !== undefined && stencil !== undefined) {
    gl.depthMask(true);
    gl.clearBufferfi(gl.DEPTH_STENCIL, 0, depth, stencil);
  } else if (depth !== undefined) {
    gl.depthMask(true);
    _clearDepth[0] = depth;
    gl.clearBufferfv(gl.DEPTH, 0, _clearDepth);
  } else if (stencil !== undefined) {
    _clearStencil[0] = stencil;
    gl.clearBufferiv(gl.STENCIL, 0, _clearStencil);
  }

  getGlRenderStateRuntime(state).context.currentBlendSignature = null;
}

function captureGlPassState(state: GlRenderState): SavedGlPassState {
  const runtime = getGlRenderStateRuntime(state);
  return {
    clipForms: [...(runtime.clipForms ?? [])],
    currentMaskDepth: runtime.currentMaskDepth ?? 0,
    framebuffer: runtime.currentFramebuffer,
    renderTarget: runtime.currentRenderTarget ?? null,
    renderTargetViewport: runtime.renderTargetViewport,
    renderTransform2D: state.renderTransform2D,
    scissorRect: runtime.currentScissorRect ?? null,
    scissorStack: [...(runtime.scissorStack ?? [])],
  };
}

function invalidateGlPassBindingCache(runtime: ReturnType<typeof getGlRenderStateRuntime>): void {
  runtime.context.currentBlendSignature = null;
  runtime.context.currentShader = null;
  runtime.context.currentTextureRealization = null;
}

function restoreGlPassState(state: GlRenderState, saved: Readonly<SavedGlPassState>): void {
  const runtime = getGlRenderStateRuntime(state);
  runtime.currentFramebuffer = saved.framebuffer;
  runtime.currentRenderTarget = saved.renderTarget;
  runtime.renderTargetViewport = saved.renderTargetViewport;
  runtime.currentScissorRect = saved.scissorRect;
  runtime.scissorStack = saved.scissorStack;
  runtime.clipForms = saved.clipForms;
  runtime.currentMaskDepth = saved.currentMaskDepth;
  state.renderTransform2D = saved.renderTransform2D;
}

function applyGlScissor(gl: GlContext, rect: Readonly<GlScissorRect> | null): void {
  if (rect === null) {
    gl.disable(gl.SCISSOR_TEST);
    return;
  }
  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(rect.x, rect.y, rect.width, rect.height);
}

function captureGlStencil(gl: GlContext): SavedGlStencil {
  return {
    fail: gl.getParameter(gl.STENCIL_FAIL) as number,
    func: gl.getParameter(gl.STENCIL_FUNC) as number,
    passDepthFail: gl.getParameter(gl.STENCIL_PASS_DEPTH_FAIL) as number,
    passDepthPass: gl.getParameter(gl.STENCIL_PASS_DEPTH_PASS) as number,
    ref: gl.getParameter(gl.STENCIL_REF) as number,
    valueMask: gl.getParameter(gl.STENCIL_VALUE_MASK) as number,
    writeMask: gl.getParameter(gl.STENCIL_WRITEMASK) as number,
  };
}

function restoreGlStencil(gl: GlContext, saved: Readonly<SavedGlStencil> | null): void {
  if (saved === null) {
    gl.disable(gl.STENCIL_TEST);
    return;
  }
  gl.enable(gl.STENCIL_TEST);
  gl.stencilMask(saved.writeMask);
  gl.stencilFunc(saved.func, saved.ref, saved.valueMask);
  gl.stencilOp(saved.fail, saved.passDepthFail, saved.passDepthPass);
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
  const passWidth = Math.max(0, viewport.width);
  const passHeight = Math.max(0, viewport.height);
  const rawLeft = Math.floor(viewport.x);
  const rawRight = passWidth === 0 ? rawLeft : Math.ceil(viewport.x + passWidth);
  const rawTop = Math.floor(viewport.y);
  const rawBottom = passHeight === 0 ? rawTop : Math.ceil(viewport.y + passHeight);
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

function isGlRenderPass(value: GlRenderPass | GlRenderState): value is GlRenderPass {
  return 'state' in value && 'target' in value;
}

function acquireGlRenderPassHandle(gl: GlContext, state: GlRenderState, target: GlRenderTarget): GlRenderPass {
  let pool = _passHandlePool.get(gl);
  if (pool !== undefined && pool.length > 0) {
    const handle = pool.pop()! as { gl: GlContext; state: GlRenderState; target: GlRenderTarget };
    handle.gl = gl;
    handle.state = state;
    handle.target = target;
    return handle as GlRenderPass;
  }
  const handle = allocateEntity<GlRenderPass>();
  (handle as { gl: GlContext }).gl = gl;
  (handle as { state: GlRenderState }).state = state;
  (handle as { target: GlRenderTarget }).target = target;
  return finishEntity(handle);
}

function releaseGlRenderPassHandle(gl: GlContext, handle: GlRenderPass): void {
  let pool = _passHandlePool.get(gl);
  if (pool === undefined) {
    pool = [];
    _passHandlePool.set(gl, pool);
  }
  pool.push(handle);
}

// A WebGL context has exactly one framebuffer binding and one live stencil gate. Keying the pass
// bracket by that physical owner keeps cache GlRenderStates sharing a context in the same LIFO scope.
const _passStack = new WeakMap<GlContext, GlPassStackEntry[]>();
const _passHandlePool = new WeakMap<GlContext, GlRenderPass[]>();
const _clearDepth = new Float32Array(1);
const _clearRgba = new Float32Array(4);
const _clearStencil = new Int32Array(1);
