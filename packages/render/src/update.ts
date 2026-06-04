import { getAppearanceRevision, getLocalTransformRevision, getSceneNodeRuntime, getSceneParent } from '@flighthq/scene';
import { getDisplayObjectRuntime } from '@flighthq/scene-display';
import { getSpriteNodeRuntime } from '@flighthq/scene-sprite';
import type {
  DisplayObject,
  DisplayObjectRenderNode,
  RenderNodeAdapter,
  RenderState,
  SceneNode,
  SpriteNode,
  SpriteRenderNode,
} from '@flighthq/types';
import { RenderFeatures } from '@flighthq/types';

import { updateRenderNodeAppearance } from './appearance';
import { hasRenderFeatures } from './renderer';
import { syncRenderNodeRenderer } from './renderNode';
import { getOrCreateDefaultDisplayObjectRenderNode, getOrCreateSpriteRenderNode } from './renderNode2d';
import type { RenderNodeStateInternal } from './renderNodeInternal';
import { updateDisplayObjectRenderTransform, updateRenderNode2DTransform } from './transform2d';

/**
 * First pass, update appearance, transforms, identify masks
 */
export function updateDisplayObject(state: RenderState, source: DisplayObject): boolean {
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

    if (current !== source) {
      const parent = getSceneParent(current);
      if (parent === null) {
        parentData = undefined;
        lastParent = null;
        scrollRectangleDepth = 0;
        maskDepth = 0;
      } else if (parent !== lastParent) {
        parentData = getOrCreateDefaultDisplayObjectRenderNode(state, parent);
        lastParent = parent;
        scrollRectangleDepth = hasScrollRects ? parentData.scrollRectangleDepth : 0;
        maskDepth = hasMasks ? parentData.maskDepth : 0;
      }
    }

    const data = getOrCreateDefaultDisplayObjectRenderNode(state, current);

    // Pre-check dirtiness using the scene node directly (data.source may be a cache primitive)
    const parentDirty =
      parentData !== undefined &&
      (parentData.transformFrameID === state.currentFrameID || parentData.appearanceFrameID === state.currentFrameID);
    const localDirty =
      data.lastLocalTransformID !== getLocalTransformRevision(current as SceneNode) ||
      data.lastAppearanceID !== getAppearanceRevision(current as SceneNode);

    if (parentDirty || localDirty) {
      data.resolver = getSceneNodeRuntime(current).resolver;
      data.source = current;
      // Reset so updateRenderNode2DTransform always recomputes a fresh base for the adapter
      data.lastLocalTransformID = -1;

      updateRenderNodeAppearance(state, data, parentData);
      updateDisplayObjectRenderTransform(state, data, parentData);

      treeDirty = true;

      let updateChildren = true;
      if (data.resolver !== null) {
        const result = (data.resolver as RenderNodeAdapter).adapt(state, current, data);
        if (result !== null) {
          updateChildren = result;
          syncRenderNodeRenderer(state, data);
        }
      }
      data.updateChildren = updateChildren;
    }

    if (hasScrollRects && current.scrollRectangle !== null) {
      data.scrollRectangleDepth = ++scrollRectangleDepth;
    } else {
      data.scrollRectangleDepth = scrollRectangleDepth;
    }

    const mask = current.mask;
    if (hasMasks && mask !== null) {
      const maskData = getOrCreateDefaultDisplayObjectRenderNode(state, mask);
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

export function updateSprite(state: RenderState, source: SpriteNode): boolean {
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

    const parentDirty =
      parentData !== undefined &&
      (parentData.transformFrameID === state.currentFrameID || parentData.appearanceFrameID === state.currentFrameID);
    const localDirty =
      data.lastLocalTransformID !== getLocalTransformRevision(current as SceneNode) ||
      data.lastAppearanceID !== getAppearanceRevision(current as SceneNode);

    if (parentDirty || localDirty) {
      data.resolver = getSceneNodeRuntime(current).resolver;
      data.source = current;
      data.lastLocalTransformID = -1;

      updateRenderNodeAppearance(state, data, parentData);
      updateRenderNode2DTransform(state, data, parentData);

      treeDirty = true;

      let updateChildren = true;
      if (data.resolver !== null) {
        const result = (data.resolver as RenderNodeAdapter).adapt(state, current, data);
        if (result !== null) {
          updateChildren = result;
          syncRenderNodeRenderer(state, data);
        }
      }
      data.updateChildren = updateChildren;
    }

    if (!data.updateChildren) continue;

    const children = getSpriteNodeRuntime(current).children;
    if (children !== null) {
      for (let i = children.length - 1; i >= 0; i--) {
        tempStack[stackLength++] = children[i] as SpriteNode;
      }
    }
  }

  return treeDirty;
}
