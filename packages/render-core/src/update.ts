import { getGraphParent } from '@flighthq/scenegraph-core';
import { getDisplayObjectRuntime } from '@flighthq/scenegraph-display';
import { getSpriteNodeRuntime } from '@flighthq/scenegraph-sprite';
import type {
  DisplayObject,
  DisplayObjectRenderNode,
  RenderState,
  SpriteNode,
  SpriteRenderNode,
} from '@flighthq/types';

import { updateRenderNodeAppearance } from './appearance';
import type { RenderStateInternal } from './internal';
import { getOrCreateDisplayObjectRenderNode, getOrCreateSpriteRenderNode } from './renderNode2d';
import { updateDisplayObjectRenderTransform, updateRenderNode2DTransform } from './transform2d';

/**
 * First pass, update appearance, transforms, identify masks
 */
export function updateDisplayObjectBeforeRender(state: RenderState, source: DisplayObject): boolean {
  const tempStack = state.tempStack;
  const currentFrameID = ++(state as RenderStateInternal).currentFrameID;

  let stackLength = 1;
  tempStack[0] = source;

  let parentData: DisplayObjectRenderNode | undefined = undefined;
  let lastParent: DisplayObject | null = null;
  let scrollRectDepth: number = 0;
  let maskDepth: number = 0;
  let treeDirty = false;

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as DisplayObject;
    if (!current.enabled) continue;
    const data = getOrCreateDisplayObjectRenderNode(state, current);

    if (current !== source) {
      const parent = getGraphParent(current);
      if (parent === null) {
        parentData = undefined;
        lastParent = null;
        scrollRectDepth = 0;
        maskDepth = 0;
      } else if (parent !== lastParent) {
        parentData = getOrCreateDisplayObjectRenderNode(state, parent);
        lastParent = parent;
        scrollRectDepth = parentData.scrollRectDepth;
        maskDepth = parentData.maskDepth;
      }
    }

    const appearanceDirty = updateRenderNodeAppearance(state, data, parentData);
    const transformDirty = updateDisplayObjectRenderTransform(state, data, parentData);

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
      const maskData = getOrCreateDisplayObjectRenderNode(state, mask);
      maskData.isMaskFrameID = currentFrameID;
      maskData.scrollRectDepth = 0;
      maskData.maskDepth = 0;
      tempStack[stackLength++] = mask;
      data.maskDepth = ++maskDepth;
    } else {
      data.maskDepth = maskDepth;
    }

    const children = getDisplayObjectRuntime(current).children;
    if (children !== null) {
      for (let i = children.length - 1; i >= 0; i--) {
        tempStack[stackLength++] = children[i] as DisplayObject;
      }
    }
  }

  return treeDirty;
}

export function updateSpriteBeforeRender(state: RenderState, source: SpriteNode): boolean {
  const tempStack = state.tempStack;
  ++(state as RenderStateInternal).currentFrameID;

  let stackLength = 1;
  tempStack[0] = source;

  let parentData: SpriteRenderNode | undefined = undefined;
  let lastParent: SpriteNode | null = null;
  let treeDirty = false;

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as SpriteNode;
    if (!current.enabled) continue;
    const data = getOrCreateSpriteRenderNode(state, current);

    if (current !== source) {
      const parent = getGraphParent(current);
      if (parent === null) {
        parentData = undefined;
        lastParent = null;
      } else if (parent !== lastParent) {
        parentData = getOrCreateSpriteRenderNode(state, parent);
        lastParent = parent;
      }
    }

    const appearanceDirty = updateRenderNodeAppearance(state, data, parentData);
    const transformDirty = updateRenderNode2DTransform(state, data, parentData);

    if (!treeDirty) {
      treeDirty = appearanceDirty || transformDirty;
    }

    const children = getSpriteNodeRuntime(current).children;
    if (children !== null) {
      for (let i = children.length - 1; i >= 0; i--) {
        tempStack[stackLength++] = children[i] as SpriteNode;
      }
    }
  }

  return treeDirty;
}
