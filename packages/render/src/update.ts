import { getSceneParent } from '@flighthq/scene';
import { getDisplayObjectRuntime } from '@flighthq/scene-display';
import { getSpriteNodeRuntime } from '@flighthq/scene-sprite';
import type {
  DisplayObject,
  DisplayObjectRenderNode,
  RenderState,
  SpriteNode,
  SpriteRenderNode,
} from '@flighthq/types';
import { RenderFeatures } from '@flighthq/types';

import { updateRenderNodeAppearance } from './appearance';
import { hasRenderFeatures } from './renderer';
import type { RenderNodeStateInternal } from './renderNodeInternal';
import { resolveDisplayObjectRenderNode } from './renderNodeResolver';
import {
  getOrCreateDefaultDisplayObjectRenderNode,
  getOrCreateDisplayObjectRenderNode,
  getOrCreateSpriteRenderNode,
} from './renderNode2d';
import { updateDisplayObjectRenderTransform, updateRenderNode2DTransform } from './transform2d';

function resolveDisplayObjectNodeForUpdate(
  state: RenderState,
  current: DisplayObject,
): { data: DisplayObjectRenderNode; dirty: boolean } {
  const resolution = resolveDisplayObjectRenderNode(state, current, () =>
    getOrCreateDefaultDisplayObjectRenderNode(state, current),
  );
  return { data: resolution.node, dirty: resolution.dirty === true };
}

/**
 * First pass, update appearance, transforms, identify masks
 */
export function updateDisplayObjectBeforeRender(state: RenderState, source: DisplayObject): boolean {
  const internal = state as RenderNodeStateInternal;
  const tempStack = state.tempStack;
  const currentFrameID = ++internal.currentFrameID;

  let stackLength = 1;
  tempStack[0] = source;

  let parentData: DisplayObjectRenderNode | undefined = undefined;
  let lastParent: DisplayObject | null = null;
  let scrollRectangleDepth: number = 0;
  let maskDepth: number = 0;
  let treeDirty = false;
  const hasMasks = hasRenderFeatures(state, RenderFeatures.Masks);
  const hasScrollRects = hasRenderFeatures(state, RenderFeatures.ScrollRectangle);

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as DisplayObject;
    if (!current.enabled) continue;
    const resolved = resolveDisplayObjectNodeForUpdate(state, current);
    const data = resolved.data;

    if (current !== source) {
      const parent = getSceneParent(current);
      if (parent === null) {
        parentData = undefined;
        lastParent = null;
        scrollRectangleDepth = 0;
        maskDepth = 0;
      } else if (parent !== lastParent) {
        parentData = getOrCreateDisplayObjectRenderNode(state, parent);
        lastParent = parent;
        scrollRectangleDepth = hasScrollRects ? parentData.scrollRectangleDepth : 0;
        maskDepth = hasMasks ? parentData.maskDepth : 0;
      }
    }

    if (resolved.dirty) {
      data.lastAppearanceID = -1;
      data.lastLocalTransformID = -1;
    }

    const appearanceDirty = updateRenderNodeAppearance(state, data, parentData);
    const transformDirty = updateDisplayObjectRenderTransform(state, data, parentData);

    if (!treeDirty) {
      treeDirty = appearanceDirty || transformDirty;
    }

    if (hasScrollRects && current.scrollRectangle !== null) {
      data.scrollRectangleDepth = ++scrollRectangleDepth;
    } else {
      data.scrollRectangleDepth = scrollRectangleDepth;
    }

    const mask = current.mask;
    if (hasMasks && mask !== null) {
      const maskData = getOrCreateDisplayObjectRenderNode(state, mask);
      maskData.isMaskFrameID = currentFrameID;
      maskData.scrollRectangleDepth = 0;
      maskData.maskDepth = 0;
      tempStack[stackLength++] = mask;
      data.maskDepth = ++maskDepth;
    } else {
      data.maskDepth = maskDepth;
    }

    if (!data.updateChildren) continue;

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
  ++(state as RenderNodeStateInternal).currentFrameID;

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
      const parent = getSceneParent(current);
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
