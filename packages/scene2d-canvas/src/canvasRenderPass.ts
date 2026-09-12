import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { copyMatrix, createMatrix } from '@flighthq/geometry/contract';
import type {
  CanvasRenderPass,
  CanvasRenderState,
  CanvasRenderTarget,
  CanvasSavedPassState,
  Matrix,
  RenderTargetClear,
} from '@flighthq/types/contract';
import { BlendMode } from '@flighthq/types/contract';

import { getCanvasRenderStateRuntime } from './canvasRenderState';

// Opens a render pass into `target` and returns the handle to draw through. Binding a target on this
// backend means installing its context on the state — each canvas element has its own — so the pass
// also resets compositing to a known state: source-over, alpha 1, identity transform, and the state's
// smoothing policy. A fresh context starts at its own defaults, and a reused one is still carrying
// whatever the last draw into it left behind; neither is what the next frame expects.
//
// `clear` names what the target starts from. Canvas has one color attachment and no depth or stencil,
// so an opaque color fills the target and a transparent one erases it; depth and stencil are ignored.
// Omit it to preserve the existing pixels.
//
//   const pass = beginCanvasRenderPass(state, screen, { color: [0.1, 0.1, 0.18, 1.0] });
//   renderCanvasScene2D(pass, root);
//   endCanvasRenderPass(pass);
//
// The handle is pooled: begin claims one, end returns it. Using a handle after its end is a bug, the
// same contract as every other acquire/release bracket.
export function beginCanvasRenderPass(
  state: CanvasRenderState,
  target: CanvasRenderTarget,
  clear?: Readonly<RenderTargetClear>,
): CanvasRenderPass {
  const runtime = getCanvasRenderStateRuntime(state);
  const saved: CanvasSavedPassState = {
    // Undefined on the first pass a state ever opens, which restores cleanly: end puts back exactly what
    // begin found, and nothing may draw through a state with no pass open anyway.
    canvas: state.canvas ?? null,
    context: state.context ?? null,
    currentAlpha: runtime.currentAlpha,
    currentBlendMode: runtime.currentBlendMode,
    renderTransform2D: state.renderTransform2D,
    target: runtime.currentRenderTarget ?? null,
  };

  const context = target.context;
  state.canvas = target.canvas;
  state.context = context;
  runtime.currentRenderTarget = target;

  // Reset compositing directly rather than through the blend-mode map, so opening a pass never pulls
  // blend-mode support into a bundle that draws nothing blended; each display object re-applies its own
  // mode through state.applyBlendMode when it draws.
  context.globalCompositeOperation = 'source-over';
  runtime.currentBlendMode = BlendMode.Normal;
  context.globalAlpha = 1;
  runtime.currentAlpha = 1;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.imageSmoothingEnabled = runtime.imageSmoothingEnabled;
  context.imageSmoothingQuality = runtime.imageSmoothingQuality;

  clearCanvasRenderPassTarget(target, clear);

  const pass = acquireCanvasRenderPassHandle(state, target, context, saved);
  runtime.passStack.push(pass);
  return pass;
}

// Ends the pass: restores the enclosing pass's canvas, context, compositing shadow, and 2D transform.
// Ending a pass twice, or out of order, throws — an unbalanced bracket is a programmer error, and
// accepting it silently leaves later draws going to whichever canvas happened to be installed.
export function endCanvasRenderPass(pass: CanvasRenderPass): void {
  const state = pass.state;
  const runtime = getCanvasRenderStateRuntime(state);
  if (runtime.passStack.at(-1) !== pass) {
    throw new Error('endCanvasRenderPass: this pass is not the innermost open pass');
  }
  runtime.passStack.pop();

  const saved = pass.saved;
  state.canvas = saved.canvas!;
  state.context = saved.context!;
  state.renderTransform2D = saved.renderTransform2D;
  runtime.currentRenderTarget = saved.target;
  runtime.currentAlpha = saved.currentAlpha;
  runtime.currentBlendMode = saved.currentBlendMode;
  releaseCanvasRenderPassHandle(pass);
}

// The pass a draw entered through, when a caller holds the state rather than the handle: a registered
// renderer is dispatched with the state, and the active pass is what tells it where its draw lands.
// Null outside any pass.
export function getCanvasActiveRenderPass(state: CanvasRenderState): CanvasRenderPass | null {
  return getCanvasRenderStateRuntime(state).passStack.at(-1) ?? null;
}

// Sets the 2D root device transform the display-object update pass reads to place nodes with no scene
// parent. Call after beginCanvasRenderPass when a pass renders into a target with its own coordinate
// system (the render cache); the matching end restores the previous value. A fresh matrix is allocated
// rather than mutated in place, because the bracket saved the previous reference.
export function setCanvasRenderTransform2D(pass: CanvasRenderPass, transform: Readonly<Matrix>): void {
  const next = createMatrix();
  copyMatrix(next, transform);
  pass.state.renderTransform2D = next;
}

function acquireCanvasRenderPassHandle(
  state: CanvasRenderState,
  target: CanvasRenderTarget,
  context: CanvasRenderingContext2D,
  saved: CanvasSavedPassState,
): CanvasRenderPass {
  const pooled = _passPool.pop();
  if (pooled !== undefined) {
    pooled.context = context;
    pooled.saved = saved;
    pooled.state = state;
    pooled.target = target;
    pooled.viewport = { height: target.height, width: target.width };
    return pooled;
  }
  const out = allocateEntity<CanvasRenderPass>();
  out.context = context;
  out.saved = saved;
  out.state = state;
  out.target = target;
  out.viewport = { height: target.height, width: target.width };
  return finishEntity(out);
}

// Canvas clears by painting: an opaque colour fills, a transparent one erases. Depth and stencil have no
// meaning on this backend and are ignored rather than emulated — the pass model is shared, the storage
// is not.
function clearCanvasRenderPassTarget(
  target: Readonly<CanvasRenderTarget>,
  clear: Readonly<RenderTargetClear> | undefined,
): void {
  const rgba = clear?.colors?.[0] ?? clear?.color;
  if (rgba === undefined) return;

  const context = target.context;
  if (rgba[3] <= 0) {
    context.clearRect(0, 0, target.width, target.height);
    return;
  }
  context.fillStyle = canvasClearColorString(rgba);
  context.fillRect(0, 0, target.width, target.height);
}

// Linear float RGBA is the clear representation every backend takes; Canvas needs it as a CSS colour.
// The channels are the same values a GL clear would receive, so the two backends clear to one colour.
function canvasClearColorString(rgba: readonly [number, number, number, number]): string {
  const channel = (value: number): number => Math.max(0, Math.min(255, Math.round(value * 0xff)));
  return `rgba(${channel(rgba[0])}, ${channel(rgba[1])}, ${channel(rgba[2])}, ${Math.max(0, Math.min(1, rgba[3]))})`;
}

// A released handle keeps its state/target references until the next acquire overwrites them: they are
// plain references to objects the caller still owns, and nulling them would cost the non-null field
// types that make a live handle safe to read.
function releaseCanvasRenderPassHandle(pass: CanvasRenderPass): void {
  _passPool.push(pass);
}

// Pass handles are per-frame scaffolding, so a render loop must not allocate one per frame. The pool is
// module-scoped rather than per-state: a handle carries no canvas resource of its own, only references
// replaced on acquire.
const _passPool: CanvasRenderPass[] = [];
