import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { copyMatrix, createMatrix } from '@flighthq/geometry/contract';
import type {
  CanvasRenderState,
  CanvasRenderSurfaceCreator,
  CanvasRenderTarget,
  EntityConstruction,
  Matrix,
  RenderPassPreserve,
} from '@flighthq/types/contract';

import { getCanvasRenderStateRuntime } from './canvasRenderState';
import { setCanvasRenderStateHandles } from './canvasRenderStateHandles';
import { acquireCanvasRenderSurface, destroyCanvasRenderSurface } from './canvasRenderSurface';

type SavedCanvasState = {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  renderTransform2D: Matrix | null;
};

const _targetStack = new WeakMap<CanvasRenderState, SavedCanvasState[]>();

/**
 * Begins a render pass into `target`: redirects subsequent canvas rendering into it (saving the state's
 * current canvas, context, and 2D transform for restore, so passes nest) and CLEARS it by default.
 * `preserve` keeps the target's pixels instead. Canvas clears by erasing (clearRect), so there is no
 * colored render-target clear here; a colored backdrop is drawn as content. Carries no transform — a 2D
 * pass that needs a specific root transform calls setCanvasRenderTransform2D after begin. Pair with
 * endCanvasRenderPass. Mirrors beginGlRenderPass / beginWgpuRenderPass.
 */
export function beginCanvasRenderPass(
  state: CanvasRenderState,
  target: CanvasRenderTarget,
  preserve?: Readonly<RenderPassPreserve>,
): void {
  const runtime = getCanvasRenderStateRuntime(state);

  let stack = _targetStack.get(state);
  if (stack === undefined) {
    stack = [];
    _targetStack.set(state, stack);
  }

  stack.push({
    canvas: state.canvas,
    context: state.context,
    renderTransform2D: state.renderTransform2D,
  });

  setCanvasRenderStateHandles(state, target.canvas, target.context);
  state.context.imageSmoothingEnabled = runtime.imageSmoothingEnabled;
  state.context.imageSmoothingQuality = runtime.imageSmoothingQuality;

  const preserveColor = preserve?.preserveColor;
  const preserved = typeof preserveColor === 'boolean' ? preserveColor : preserveColor?.[0] === true;
  if (!preserved) state.context.clearRect(0, 0, target.width, target.height);
}

export function createCanvasRenderTarget(
  creator: Readonly<CanvasRenderSurfaceCreator>,
  width: number,
  height: number,
): CanvasRenderTarget {
  const out = allocateEntity<CanvasRenderTarget>();
  initializeCanvasRenderTarget(out, creator, width, height);
  return finishEntity(out);
}

export function destroyCanvasRenderTarget(target: CanvasRenderTarget): void {
  destroyCanvasRenderSurface(target.surface);
  target.width = 0;
  target.height = 0;
}

/**
 * Ends the pass opened by beginCanvasRenderPass: restores the canvas, context, and 2D transform saved at
 * begin. A call with no matching begin is a no-op. Mirrors endGlRenderPass / endWgpuRenderPass.
 */
export function endCanvasRenderPass(state: CanvasRenderState): void {
  const saved = _targetStack.get(state)?.pop();
  if (saved === undefined) return;
  setCanvasRenderStateHandles(state, saved.canvas, saved.context);
  state.renderTransform2D = saved.renderTransform2D;
}

export function initializeCanvasRenderTarget(
  out: EntityConstruction<CanvasRenderTarget>,
  creator: Readonly<CanvasRenderSurfaceCreator>,
  width: number,
  height: number,
): void {
  const targetWidth = Math.max(1, Math.ceil(width));
  const targetHeight = Math.max(1, Math.ceil(height));
  const surface = acquireCanvasRenderSurface(creator, {
    height: targetHeight,
    pixelRatio: 1,
    width: targetWidth,
  });
  if (surface === null) throw new Error('Failed to acquire Canvas render target surface.');
  out.canvas = surface.canvas;
  out.context = surface.context;
  out.height = targetHeight;
  out.surface = surface;
  out.width = targetWidth;
}

export function resizeCanvasRenderTarget(target: CanvasRenderTarget, width: number, height: number): void {
  target.canvas.width = Math.max(1, Math.ceil(width));
  target.canvas.height = Math.max(1, Math.ceil(height));
  target.width = target.canvas.width;
  target.height = target.canvas.height;
}

/**
 * Sets the 2D root device transform the display-object update pass reads to place nodes with no parent.
 * Call after beginCanvasRenderPass when a 2D pass renders into a target with its own coordinate system;
 * the value is restored by the matching endCanvasRenderPass. Allocates a fresh matrix so the bracket's
 * saved reference stays intact for restore. Mirrors setGlRenderTransform2D / setWgpuRenderTransform2D.
 */
export function setCanvasRenderTransform2D(state: CanvasRenderState, transform: Readonly<Matrix>): void {
  const next = createMatrix();
  copyMatrix(next, transform);
  state.renderTransform2D = next;
}
