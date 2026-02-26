import { getWorldTransform } from '@flighthq/stage';
import type { Renderable, RendererState } from '@flighthq/types';

import { getRenderableData, updateRenderableData } from './renderable';

export function updateRenderQueue(state: RendererState, source: Renderable): boolean {
  const renderableStack = state.renderableStack;
  const renderQueue = state.renderQueue;

  let dirty = false;
  let parentAlpha = 1;
  let renderQueueIndex = 0;

  let renderableStackLength = 1;
  renderableStack[0] = source;

  while (renderableStackLength > 0) {
    const current = renderableStack[--renderableStackLength];
    const data = getRenderableData(state, current);

    updateRenderableData(data);

    if (!dirty && data.dirty) dirty = true;
    if (!current.visible) continue;

    const mask = current.mask;
    if (mask !== null) {
      const maskData = getRenderableData(state, mask);
      updateRenderableData(maskData);
      if (!dirty && maskData.dirty) dirty = true;
      data.mask = maskData;
    }

    const renderAlpha = current.alpha * parentAlpha;
    data.renderAlpha = renderAlpha;
    data.renderTransform = getWorldTransform(source);

    renderQueue[renderQueueIndex++] = data;

    if (current.children !== null) {
      for (let i = current.children.length - 1; i >= 0; i--) {
        // Add child to stack for further traversal
        renderableStack[renderableStackLength++] = current.children[i];
      }
    }

    parentAlpha = renderAlpha;
  }

  state.renderQueueLength = renderQueueIndex;
  return dirty;
}
