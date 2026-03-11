import { getDisplayObjectRuntime } from '@flighthq/scene-graph-display';
import type { DisplayObject, Renderable, RenderState } from '@flighthq/types';

import type { RenderStateInternal } from './internal';
import { getDisplayObjectRenderNode } from './renderNode';

/**
 * Second pass, exclude non-renderable objects from queue
 */
export function prepareRenderQueue(state: RenderState, source: Renderable): void {
  const tempStack = state.tempStack;
  const currentQueue = state.currentQueue;
  const currentFrameID = state.currentFrameID;

  let stackLength = 1;
  tempStack[0] = source;
  let currentQueueIndex = 0;

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as DisplayObject;
    const data = getDisplayObjectRenderNode(state, current);
    const isMask = data.isMaskFrameID === currentFrameID;
    if (!isMask) {
      const shouldRender = data.visible && data.alpha > 0 && !(data.transform.a === 0 && data.transform.d === 0);
      if (shouldRender) {
        currentQueue[currentQueueIndex++] = data;
        const children = getDisplayObjectRuntime(current).children;
        if (children !== null) {
          for (let i = children.length - 1; i >= 0; i--) {
            tempStack[stackLength++] = children[i] as DisplayObject;
          }
        }
      }
    }
  }

  (state as RenderStateInternal).currentQueueLength = currentQueueIndex;
}
