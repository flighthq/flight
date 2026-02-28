import type { Renderable, RenderableData, RendererState } from '@flighthq/types';

import { updateAppearance } from './appearance';
import { createRenderableData } from './createRenderableData';
import type { RendererStateInternal } from './internal/writeInternal';
import { updateRenderTransform } from './transform';

export function getRenderableData(state: RendererState, source: Renderable): RenderableData {
  const renderableDataMap = state.renderableDataMap;
  if (!renderableDataMap.has(source)) renderableDataMap.set(source, createRenderableData(source));
  return renderableDataMap.get(source)!;
}

/**
 * First pass, update appearance, transforms, identify masks
 */
export function updateRenderableTree(state: RendererState, source: Renderable): boolean {
  const tempStack = state.tempStack;
  const currentFrameID = ++(state as RendererStateInternal).currentFrameID;

  let stackLength = 1;
  tempStack[0] = source;

  let parentData: RenderableData | undefined = undefined;
  let lastParent: Renderable | null = null;
  let scrollRectDepth: number = 0;
  let maskDepth: number = 0;
  let treeDirty = false;

  while (stackLength > 0) {
    const current = tempStack[--stackLength];
    const data = getRenderableData(state, current);

    const parent = current.parent;
    if (current === source || parent === null) {
      parentData = undefined;
      lastParent = null;
      scrollRectDepth = 0;
      maskDepth = 0;
    } else if (parent !== lastParent) {
      parentData = getRenderableData(state, parent);
      lastParent = parent;
      scrollRectDepth = parentData.scrollRectDepth;
      maskDepth = parentData.maskDepth;
    }

    const appearanceDirty = updateAppearance(state, data, parentData);
    const transformDirty = updateRenderTransform(state, data, parentData);

    if (!treeDirty) {
      treeDirty = appearanceDirty || transformDirty;
    }

    if (source.scrollRect !== null) {
      data.scrollRectDepth = ++scrollRectDepth;
    } else {
      data.scrollRectDepth = scrollRectDepth;
    }

    const mask = current.mask;
    if (mask !== null) {
      const maskData = getRenderableData(state, mask);
      maskData.isMaskFrameID = currentFrameID;
      maskData.scrollRectDepth = 0;
      maskData.maskDepth = 0;
      tempStack[stackLength++] = mask;
      data.maskDepth = ++maskDepth;
    } else {
      data.maskDepth = maskDepth;
    }

    if (current.children !== null) {
      for (let i = current.children.length - 1; i >= 0; i--) {
        tempStack[stackLength++] = current.children[i];
      }
    }
  }

  return treeDirty;
}
