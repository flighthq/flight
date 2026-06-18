import { createMatrix } from '@flighthq/geometry';
import { createRenderState as _createRenderState, setRenderStateBackgroundColor } from '@flighthq/render';
import type { DOMRenderOptions, DOMRenderState } from '@flighthq/types';

import type { DOMRenderStateInternal } from './internal';

export function createDOMRenderState(element: HTMLElement, options: Partial<DOMRenderOptions> = {}): DOMRenderState {
  const state = _createRenderState({
    pixelRatio: options.pixelRatio ?? 1,
    renderTransform2D: createMatrix(),
    roundPixels: options.roundPixels ?? false,
    sceneGraphSyncPolicy: options.sceneGraphSyncPolicy,
  }) as DOMRenderStateInternal;

  if (options.backgroundColor != null) setRenderStateBackgroundColor(state, options.backgroundColor);

  state.applyBlendMode = null;
  state.element = element;
  state.currentBlendMode = null;
  state.allowSmoothing = options.imageSmoothingEnabled ?? true;
  state.domCurrentElement = null;
  state.domElementMap = new WeakMap();
  state.domNextOrderList = [];
  state.domOrderLength = -1; // -1 = never rendered; forces first-call reconciliation
  state.domOrderList = [];
  state.domClipHooks = null;
  state.domClipStack = [];

  element.style.position = 'relative';
  element.style.overflow = 'hidden';

  return state;
}
