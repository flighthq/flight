import { copyMatrix, createMatrix } from '@flighthq/geometry';
import type { CanvasRenderState, Matrix } from '@flighthq/types';

import type { CanvasRenderStateInternal } from './internal';

export type CanvasRenderTarget = {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
};

type SavedCanvasState = {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  renderTransform2D: Matrix | null;
};

const _targetStack = new WeakMap<CanvasRenderState, SavedCanvasState[]>();

/**
 * Redirects subsequent canvas rendering into `target`. Saves the state's current
 * canvas, context, and renderTransform2D so they can be fully restored by
 * `endCanvasRenderTarget`. Supports nesting — each begin/end pair is independent.
 */
export function beginCanvasRenderTarget(
  state: CanvasRenderState,
  target: CanvasRenderTarget,
  renderTransform: Readonly<Matrix>,
): void {
  const internal = state as CanvasRenderStateInternal;

  let stack = _targetStack.get(state);
  if (stack === undefined) {
    stack = [];
    _targetStack.set(state, stack);
  }

  stack.push({
    canvas: internal.canvas,
    context: internal.context,
    renderTransform2D: internal.renderTransform2D,
  });

  internal.canvas = target.canvas;
  internal.context = target.context;
  internal.context.imageSmoothingEnabled = internal.imageSmoothingEnabled;
  internal.context.imageSmoothingQuality = internal.imageSmoothingQuality;

  // Always create a new matrix for this target so restoring the saved reference
  // on end leaves the outer renderTransform2D unmodified.
  const newTransform = createMatrix();
  copyMatrix(newTransform, renderTransform);
  internal.renderTransform2D = newTransform;
}

export function createCanvasRenderTarget(width: number, height: number): CanvasRenderTarget {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  const context = canvas.getContext('2d')!;
  return { canvas, context, width: canvas.width, height: canvas.height };
}

/**
 * Restores the canvas, context, and renderTransform2D saved by the matching
 * `beginCanvasRenderTarget` call.
 */
export function endCanvasRenderTarget(state: CanvasRenderState): void {
  const internal = state as CanvasRenderStateInternal;
  const saved = _targetStack.get(state)?.pop();
  if (saved === undefined) return;
  internal.canvas = saved.canvas;
  internal.context = saved.context;
  internal.renderTransform2D = saved.renderTransform2D;
}

export function resizeCanvasRenderTarget(target: CanvasRenderTarget, width: number, height: number): void {
  target.canvas.width = Math.max(1, Math.ceil(width));
  target.canvas.height = Math.max(1, Math.ceil(height));
  target.width = target.canvas.width;
  target.height = target.canvas.height;
}
