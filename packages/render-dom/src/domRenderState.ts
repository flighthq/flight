import { createMatrix3x2 } from '@flighthq/geometry';
import { createRenderState as _createRenderState, setBackgroundColor } from '@flighthq/render-core';
import type { DOMRenderOptions, DOMRenderState } from '@flighthq/types';

import type { DOMRenderStateInternal } from './internal';

export function createDOMRenderState(element: HTMLElement, options: Partial<DOMRenderOptions> = {}): DOMRenderState {
  const state = _createRenderState({
    pixelRatio: options.pixelRatio ?? window.devicePixelRatio | 1,
    renderTransform2D: createMatrix3x2(),
    roundPixels: options.roundPixels ?? false,
  }) as DOMRenderStateInternal;

  if (options.backgroundColor != null) setBackgroundColor(state, options.backgroundColor);

  state.element = element;
  state.currentBlendMode = null;
  state.allowSmoothing = options.imageSmoothingEnabled ?? true;

  element.style.position = 'relative';
  element.style.overflow = 'hidden';

  return state;
}
