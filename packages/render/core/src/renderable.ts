import type { Renderable, RendererState, RenderNode } from '@flighthq/types';

import { updateAppearance } from './appearance';
import { createRenderNode } from './createRenderNode';
import type { RendererStateInternal } from './internal';
import { updateRenderTransform } from './transform';

export function getRenderNode(state: RendererState, source: Renderable): RenderNode {
  const renderNodeMap = state.renderNodeMap;
  if (!renderNodeMap.has(source)) renderNodeMap.set(source, createRenderNode(source));
  return renderNodeMap.get(source)!;
}

/**
 * First pass, update appearance, transforms, identify masks
 */
export function updateRenderableTree(state: RendererState, source: Renderable): boolean {
  const tempStack = state.tempStack;
  const currentFrameID = ++(state as RendererStateInternal).currentFrameID;

  let stackLength = 1;
  tempStack[0] = source;

  let parentData: RenderNode | undefined = undefined;
  let lastParent: Renderable | null = null;
  let scrollRectDepth: number = 0;
  let maskDepth: number = 0;
  let treeDirty = false;

  while (stackLength > 0) {
    const current = tempStack[--stackLength];
    const data = getRenderNode(state, current);

    if (current !== source) {
      const parent = current.parent;
      if (parent === null) {
        parentData = undefined;
        lastParent = null;
        scrollRectDepth = 0;
        maskDepth = 0;
      } else if (parent !== lastParent) {
        parentData = getRenderNode(state, parent);
        lastParent = parent;
        scrollRectDepth = parentData.scrollRectDepth;
        maskDepth = parentData.maskDepth;
      }
    }

    const appearanceDirty = updateAppearance(state, data, parentData);
    const transformDirty = updateRenderTransform(state, data, parentData);

    if (!treeDirty) {
      treeDirty = appearanceDirty || transformDirty;
    }

    if (current.scrollRect !== null) {
      data.scrollRectDepth = ++scrollRectDepth;
    } else {
      data.scrollRectDepth = scrollRectDepth;
    }

    const mask = current.mask;
    if (mask !== null) {
      const maskData = getRenderNode(state, mask);
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
