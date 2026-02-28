import { matrix3x2 } from '@flighthq/geometry';
import { createRendererState, setBackgroundColor } from '@flighthq/render-core';
import type { CanvasRendererOptions, CanvasRendererState } from '@flighthq/types';

import type { CanvasRendererStateInternal } from './internal/writeInternal';

export function createCanvasRendererState(
  canvas: HTMLCanvasElement,
  options: Partial<CanvasRendererOptions> = {},
): CanvasRendererState {
  const context = canvas.getContext('2d', options.contextAttributes || undefined);
  if (!context) throw new Error('Failed to get context for canvas.');

  const state = createRendererState({
    pixelRatio: options.pixelRatio ?? window.devicePixelRatio | 1,
    renderTransform: options.renderTransform ?? matrix3x2.create(),
    roundPixels: options.roundPixels ?? false,
  }) as CanvasRendererStateInternal;

  if (options.backgroundColor) setBackgroundColor(state, options.backgroundColor);

  state.canvas = canvas;
  state.context = context;
  state.contextAttributes = context.getContextAttributes();

  context.imageSmoothingEnabled = options.imageSmoothingEnabled ?? true;
  context.imageSmoothingQuality = options.imageSmoothingQuality ?? 'high';
  return state;
}
