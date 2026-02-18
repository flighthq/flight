import { matrix3x2 } from '@flighthq/math';
import type { CanvasRendererOptions, CanvasRendererState } from '@flighthq/types';

import { setBackgroundColor } from './color';

export function createCanvasRendererState(
  canvas: HTMLCanvasElement,
  options: Partial<CanvasRendererOptions> = {},
): CanvasRendererState {
  const context = canvas.getContext('2d', options.contextAttributes || undefined);
  if (!context) throw new Error('Failed to get context for canvas.');

  context.imageSmoothingEnabled = options.imageSmoothingEnabled ?? true;
  context.imageSmoothingQuality = options.imageSmoothingQuality ?? 'high';

  const contextAttributes = context.getContextAttributes();
  const backgroundColor = options.backgroundColor ?? 0x00000000;
  const pixelRatio = options.pixelRatio ?? window.devicePixelRatio | 1;
  const renderTransform = options.renderTransform ?? matrix3x2.create();
  const roundPixels = options.roundPixels ?? false;

  const state: CanvasRendererState = {
    backgroundColor: 0,
    backgroundColorRGBA: [],
    backgroundColorString: '',
    canvas: canvas,
    context: context,
    contextAttributes: contextAttributes,
    currentBlendMode: null,
    pixelRatio: pixelRatio,
    renderableStack: [],
    renderData: new WeakMap(),
    renderTransform: renderTransform,
    renderQueue: [],
    renderQueueLength: 0,
    roundPixels: roundPixels,
  };

  setBackgroundColor(state, backgroundColor);
  return state;
}
