import type { Renderable, RendererState } from '@flighthq/types';

import type { RendererStateInternal } from './internal/writeInternal';
import { getRenderableData } from './renderable';

/**
 * Second pass, propagate masks, exclude non-renderable objects from queue
 */
export function prepareRenderQueue(state: RendererState, source: Renderable): void {
  const tempStack = (state as RendererStateInternal).tempStack;
  const currentQueue = (state as RendererStateInternal).currentQueue;
  const currentFrameID = (state as RendererStateInternal).currentFrameID;

  let stackLength = 1;
  tempStack[0] = source;
  let currentQueueIndex = 0;

  while (stackLength > 0) {
    const current = tempStack[--stackLength];
    const data = getRenderableData(state, current);
    const isMask = data.maskFrameID === currentFrameID;
    if (!isMask) {
      const shouldRender = data.visible && data.alpha > 0 && !(data.transform.a === 0 && data.transform.d === 0);
      if (shouldRender) {
        currentQueue[currentQueueIndex++] = data;
        if (current.children !== null) {
          for (let i = current.children.length - 1; i >= 0; i--) {
            tempStack[stackLength++] = current.children[i];
          }
        }
      }
    }
  }

  (state as RendererStateInternal).currentQueueLength = currentQueueIndex;
}
