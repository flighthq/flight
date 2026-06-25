import { copyMatrix, createMatrix } from '@flighthq/geometry';
import type { CanvasRenderState, CanvasRenderTarget, Matrix } from '@flighthq/types';

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
 * Redirects subsequent canvas rendering into `target`. Saves the state's current
 * canvas, context, and renderTransform2D so they can be fully restored by
 * `endCanvasRenderTarget`. Supports nesting — each begin/end pair is independent.
 */
export function beginCanvasRenderTarget(
  state: CanvasRenderState,
  target: CanvasRenderTarget,
  renderTransform: Readonly<Matrix>,
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

  // Always create a new matrix for this target so restoring the saved reference
  // on end leaves the outer renderTransform2D unmodified.
  const newTransform = createMatrix();
  copyMatrix(newTransform, renderTransform);
  handles.renderTransform2D = newTransform;
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
 * Restores the canvas, context, and renderTransform2D saved by the matching
 * `beginCanvasRenderTarget` call.
 */
export function endCanvasRenderTarget(state: CanvasRenderState): void {
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
