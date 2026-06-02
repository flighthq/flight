import { hasRenderFeatures } from '@flighthq/render-core';
import { getDisplayObjectRuntime } from '@flighthq/scene-display';
import type { DisplayObject, Renderable, RenderState } from '@flighthq/types';
import { RenderFeatures } from '@flighthq/types';

import type { RenderTreeStateInternal } from './internal';
import { getOrCreateDisplayObjectRenderNode } from './renderTreeNode2d';

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
  const hasMasks = hasRenderFeatures(state, RenderFeatures.Masks);

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as DisplayObject;
    if (!current.enabled) continue;
    const data = getOrCreateDisplayObjectRenderNode(state, current);
    const isMask = hasMasks && data.isMaskFrameID === currentFrameID;
    if (!isMask) {
      const shouldRender = data.visible && data.alpha > 0 && !(data.transform2D.a === 0 && data.transform2D.d === 0);
      if (shouldRender) {
        currentQueue[currentQueueIndex++] = data;
        if (!data.updateChildren) continue;
        const children = getDisplayObjectRuntime(current).children;
        if (children !== null) {
          for (let i = children.length - 1; i >= 0; i--) {
            tempStack[stackLength++] = children[i] as DisplayObject;
          }
        }
      }
    }
  }

  (state as RenderTreeStateInternal).currentQueueLength = currentQueueIndex;
}
