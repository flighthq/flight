import { createMatrix } from '@flighthq/geometry';
import { createRenderState as _createRenderState, setRenderStateBackgroundColor } from '@flighthq/render';
import type { CanvasRenderOptions, CanvasRenderState } from '@flighthq/types';

import type { CanvasRenderStateInternal } from './internal';

export function createCanvasRenderState(
  canvas: HTMLCanvasElement,
  options: Partial<CanvasRenderOptions> = {},
): CanvasRenderState {
  const context = canvas.getContext('2d', options.contextAttributes || undefined);
  if (!context) throw new Error('Failed to get context for canvas.');

  const state = _createRenderState({
    pixelRatio: options.pixelRatio ?? (window.devicePixelRatio || 1),
    renderTransform2D: options.renderTransform ?? createMatrix(),
    roundPixels: options.roundPixels ?? false,
  }) as CanvasRenderStateInternal;

  if (options.backgroundColor) setRenderStateBackgroundColor(state, options.backgroundColor);

  state.canvas = canvas;
  state.context = context;
  state.contextAttributes = context.getContextAttributes();
  state.imageSmoothingEnabled = options.imageSmoothingEnabled ?? true;
  state.imageSmoothingQuality = options.imageSmoothingQuality ?? 'high';

  context.imageSmoothingEnabled = state.imageSmoothingEnabled;
  context.imageSmoothingQuality = state.imageSmoothingQuality;
  return state;
}
