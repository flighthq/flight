import { copyMatrix, createMatrix } from '@flighthq/geometry';
import type { CanvasRenderState, CanvasRenderTarget, Matrix, RenderPassPreserve } from '@flighthq/types';

import { getCanvasRenderStateRuntime } from './canvasRenderState';

// Writable view of the readonly canvas/context handles. The render-target redirection deliberately
// swaps these handles, so this narrow cast is the redirection boundary — mirrors the construction
// boundary in createCanvasRenderState.
type CanvasRenderStateHandles = CanvasRenderState & {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
};

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
  const handles = state as CanvasRenderStateHandles;
  const runtime = getCanvasRenderStateRuntime(state);

  let stack = _targetStack.get(state);
  if (stack === undefined) {
    stack = [];
    _targetStack.set(state, stack);
  }

  stack.push({
    canvas: handles.canvas,
    context: handles.context,
    renderTransform2D: handles.renderTransform2D,
  });

  handles.canvas = target.canvas;
  handles.context = target.context;
  handles.context.imageSmoothingEnabled = runtime.imageSmoothingEnabled;
  handles.context.imageSmoothingQuality = runtime.imageSmoothingQuality;

  const preserveColor = preserve?.preserveColor;
  const preserved = typeof preserveColor === 'boolean' ? preserveColor : preserveColor?.[0] === true;
  if (!preserved) handles.context.clearRect(0, 0, target.width, target.height);
}

export function createCanvasRenderTarget(width: number, height: number): CanvasRenderTarget {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  const context = canvas.getContext('2d')!;
  return { canvas, context, width: canvas.width, height: canvas.height };
}

export function destroyCanvasRenderTarget(target: CanvasRenderTarget): void {
  // Collapse the canvas to zero size so the browser can reclaim its backing store now.
  // Setting width/height to 0 also implicitly resets the context state.
  target.canvas.width = 0;
  target.canvas.height = 0;
  target.width = 0;
  target.height = 0;
}

/**
 * Ends the pass opened by beginCanvasRenderPass: restores the canvas, context, and 2D transform saved at
 * begin. A call with no matching begin is a no-op. Mirrors endGlRenderPass / endWgpuRenderPass.
 */
export function endCanvasRenderPass(state: CanvasRenderState): void {
  const handles = state as CanvasRenderStateHandles;
  const saved = _targetStack.get(state)?.pop();
  if (saved === undefined) return;
  handles.canvas = saved.canvas;
  handles.context = saved.context;
  handles.renderTransform2D = saved.renderTransform2D;
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
  const handles = state as CanvasRenderStateHandles;
  const next = createMatrix();
  copyMatrix(next, transform);
  handles.renderTransform2D = next;
}
