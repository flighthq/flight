import { matrix3x2 } from '@flighthq/geometry';
import { createRenderState as _createRenderState, setBackgroundColor } from '@flighthq/render-core';
import type { DOMRenderOptions, DOMRenderState } from '@flighthq/types';

import type { DOMRenderStateInternal } from './internal';

export function createDOMRenderState(element: HTMLElement, options: Partial<DOMRenderOptions> = {}): DOMRenderState {
  const state = _createRenderState({
    pixelRatio: options.pixelRatio ?? window.devicePixelRatio | 1,
    renderTransform2D: matrix3x2.create(),
    roundPixels: options.roundPixels ?? false,
  }) as DOMRenderStateInternal;

  if (options.backgroundColor != null) setBackgroundColor(state, options.backgroundColor);

  state.element = element;
  state.currentBlendMode = null;

  element.style.position = 'relative';
  element.style.overflow = 'hidden';

  return state;
}
