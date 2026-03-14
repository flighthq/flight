import { matrix3x2 } from '@flighthq/geometry';
import { createRenderState as _createRenderState, setBackgroundColor } from '@flighthq/render-core';
import type { CanvasRenderOptions, CanvasRenderState } from '@flighthq/types';

import type { CanvasRenderStateInternal } from './internal';

export function createRenderState(
  canvas: HTMLCanvasElement,
  options: Partial<CanvasRenderOptions> = {},
): CanvasRenderState {
  const context = canvas.getContext('2d', options.contextAttributes || undefined);
  if (!context) throw new Error('Failed to get context for canvas.');

  const state = _createRenderState({
    pixelRatio: options.pixelRatio ?? window.devicePixelRatio | 1,
    renderTransform2D: options.renderTransform ?? matrix3x2.create(),
    roundPixels: options.roundPixels ?? false,
  }) as CanvasRenderStateInternal;

  if (options.backgroundColor) setBackgroundColor(state, options.backgroundColor);

  state.canvas = canvas;
  state.context = context;
  state.contextAttributes = context.getContextAttributes();

  context.imageSmoothingEnabled = options.imageSmoothingEnabled ?? true;
  context.imageSmoothingQuality = options.imageSmoothingQuality ?? 'high';
  return state;
}
