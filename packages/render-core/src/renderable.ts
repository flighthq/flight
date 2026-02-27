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
export function updateRenderableDataTree(state: RendererState, source: Renderable): boolean {
  const tempStack = (state as RendererStateInternal).tempStack;
  const currentFrameID = ++(state as RendererStateInternal).currentFrameID;

  let stackLength = 1;
  tempStack[0] = source;

  let lastParent: Renderable | null = null;
  let lastParentData: RenderableData | undefined = undefined;
  let treeDirty = false;

  while (stackLength > 0) {
    const current = tempStack[--stackLength];
    const data = getRenderableData(state, current);

    let parentData;
    if (current === source) {
      parentData = undefined;
    } else {
      const parent = current.parent;
      if (parent === lastParent) {
        parentData = lastParentData;
      } else {
        parentData = parent ? getRenderableData(state, parent) : undefined;
        lastParent = parent;
        lastParentData = parentData;
      }
    }

    const appearanceDirty = updateAppearance(state, data, parentData);
    const transformDirty = updateRenderTransform(state, data, parentData);

    if (!treeDirty) {
      treeDirty = appearanceDirty || transformDirty;
    }

    if (current.mask !== null) {
      const maskData = getRenderableData(state, current.mask);
      maskData.maskFrameID = currentFrameID;
      data.mask = maskData;
    } else {
      data.mask = null;
    }

    if (current.children !== null) {
      for (let i = current.children.length - 1; i >= 0; i--) {
        tempStack[stackLength++] = current.children[i];
      }
    }
  }

  return treeDirty;
}
