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
    pixelRatio: options.pixelRatio ?? 1,
    renderTransform2D: options.renderTransform ?? createMatrix(),
    roundPixels: options.roundPixels ?? false,
    sceneGraphSyncPolicy: options.sceneGraphSyncPolicy,
  }) as CanvasRenderStateInternal;

  if (options.backgroundColor != null) setRenderStateBackgroundColor(state, options.backgroundColor);

  state.applyBlendMode = null;
  state.canvas = canvas;
  state.context = context;
  state.contextAttributes = context.getContextAttributes();
  state.currentBlendMode = null;
  state.imageSmoothingEnabled = options.imageSmoothingEnabled ?? true;
  state.imageSmoothingQuality = options.imageSmoothingQuality ?? 'high';

  context.imageSmoothingEnabled = state.imageSmoothingEnabled;
  context.imageSmoothingQuality = state.imageSmoothingQuality;
  return state;
}
