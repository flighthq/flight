import { getWorldTransform } from '@flighthq/stage';
import type { Renderable, RendererState } from '@flighthq/types';

import { createRenderableData } from './createRenderableData';
import { isRenderableDirty } from './dirty';

export function updateRenderQueue(state: RendererState, source: Renderable): boolean {
  const renderableStack = state.renderableStack;
  const renderDataMap = state.renderData;
  const renderQueue = state.renderQueue;

  let dirty = false;
  let parentAlpha = 1;
  let renderQueueIndex = 0;

  let renderableStackLength = 1;
  renderableStack[0] = source;

  while (renderableStackLength > 0) {
    const current = renderableStack[--renderableStackLength];
    const renderData =
      renderDataMap.get(current) ?? renderDataMap.set(current, createRenderableData(current)).get(current)!;

    if (isRenderableDirty(renderData) && !dirty) dirty = true;
    if (!current.visible) continue;

    const mask = current.mask;
    if (mask !== null) {
      const maskRenderData = renderDataMap.get(mask) ?? renderDataMap.set(mask, createRenderableData(mask)).get(mask)!;
      if (isRenderableDirty(maskRenderData) && !dirty) dirty = true;
      renderData.mask = maskRenderData;
    }

    const renderAlpha = current.alpha * parentAlpha;
    renderData.renderAlpha = renderAlpha;
    renderData.renderTransform = getWorldTransform(source);

    renderQueue[renderQueueIndex++] = renderData;

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
