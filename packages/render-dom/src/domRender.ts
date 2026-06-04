import {
  adaptRenderNode,
  beginFrame,
  beginRenderNodeUpdate,
  getOrCreateDisplayObjectRenderNode,
  getOrCreateSpriteRenderNode,
  hasRenderFeatures,
  isRenderNodeDirty,
  isRenderNodeVisible,
  updateDisplayObjectRenderTransform,
  updateRenderNode2DTransform,
  updateRenderNodeAppearance,
} from '@flighthq/render';
import { getSceneParent } from '@flighthq/scene';
import { getDisplayObjectRuntime } from '@flighthq/scene-display';
import { getSpriteNodeRuntime } from '@flighthq/scene-sprite';
import type {
  DisplayObject,
  DisplayObjectRenderNode,
  DOMRenderState,
  SpriteNode,
  SpriteRenderNode,
} from '@flighthq/types';
import { RenderFeatures } from '@flighthq/types';

import { detectDOMStructureChange, processDOMNode, reconcileDOMContainer, swapDOMOrderLists } from './domReconcile';
import { isMutableSpriteBatchKind } from './domSprite';
import type { DOMRenderStateInternal } from './internal';

export function prepareDOMDisplayObjectRender(state: DOMRenderState, source: DisplayObject): boolean {
  const frameID = beginFrame(state);
  const internal = state as DOMRenderStateInternal;
  const container = state.element;
  const hooks = internal.domClipHooks;
  const tempStack = state.tempStack;
  const hasMasks = hasRenderFeatures(state, RenderFeatures.Masks);
  const hasScrollRects = hasRenderFeatures(state, RenderFeatures.ScrollRectangle);

  let stackLength = 1;
  tempStack[0] = source;

  let parentData: DisplayObjectRenderNode | undefined = undefined;
  let lastParent: DisplayObject | null = null;
  let scrollRectangleDepth = 0;
  let maskDepth = 0;
  let treeDirty = false;

  let newLength = 0;
  let needsReconcile = false;

  const pendingClips: DOMClipAction[] = [];

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as DisplayObject;

    if (!current.enabled) {
      drainDOMClips(state, hooks, pendingClips, stackLength);
      continue;
    }

    if (current !== source) {
      const parent = getSceneParent(current);
      if (parent === null) {
        parentData = undefined;
        lastParent = null;
        scrollRectangleDepth = 0;
        maskDepth = 0;
      } else if (parent !== lastParent) {
        parentData = getOrCreateDisplayObjectRenderNode(state, parent as DisplayObject);
        lastParent = parent as DisplayObject;
        scrollRectangleDepth = hasScrollRects ? parentData.scrollRectangleDepth : 0;
        maskDepth = hasMasks ? parentData.maskDepth : 0;
      }
    }

    const data = getOrCreateDisplayObjectRenderNode(state, current);

    if (isRenderNodeDirty(state, current, data, parentData)) {
      beginRenderNodeUpdate(current, data);
      updateRenderNodeAppearance(state, data, parentData);
      updateDisplayObjectRenderTransform(state, data, parentData);
      adaptRenderNode(state, current, data);
      treeDirty = true;
    }

    if (hasScrollRects && current.scrollRectangle !== null) {
      data.scrollRectangleDepth = ++scrollRectangleDepth;
    } else {
      data.scrollRectangleDepth = scrollRectangleDepth;
    }

    const mask = current.mask;
    if (hasMasks && mask !== null) {
      const maskData = getOrCreateDisplayObjectRenderNode(state, mask);
      maskData.isMaskFrameID = frameID;
      maskData.scrollRectangleDepth = 0;
      maskData.maskDepth = 0;
      tempStack[stackLength++] = mask;
      data.maskDepth = ++maskDepth;
    } else {
      data.maskDepth = maskDepth;
    }

    if (hasMasks && data.isMaskFrameID === frameID) {
      drainDOMClips(state, hooks, pendingClips, stackLength);
      continue;
    }

    if (!isRenderNodeVisible(data)) {
      drainDOMClips(state, hooks, pendingClips, stackLength);
      continue;
    }

    let pushed = 0;
    if (hooks !== null) pushed = hooks.push(state, data);

    if (data.renderer !== null) {
      const result = processDOMNode(internal, data, frameID, () => data.renderer!.draw(state, data), newLength);
      newLength = result.newLength;
      if (result.needsReconcile) needsReconcile = true;
      if (hooks !== null) hooks.apply(state, data);
    }

    const prePushLength = stackLength;

    if (data.updateChildren) {
      const children = getDisplayObjectRuntime(current).children;
      if (children !== null) {
        for (let i = children.length - 1; i >= 0; i--) {
          tempStack[stackLength++] = children[i] as DisplayObject;
        }
      }
    }

    if (pushed > 0) {
      pendingClips.push({ atStackLength: prePushLength, count: pushed });
    }

    drainDOMClips(state, hooks, pendingClips, stackLength);
  }

  for (let i = pendingClips.length - 1; i >= 0; i--) {
    hooks!.pop(state, pendingClips[i].count);
  }

  if (detectDOMStructureChange(internal, newLength, needsReconcile)) {
    reconcileDOMContainer(container, internal, newLength);
  }

  swapDOMOrderLists(internal, newLength);

  return treeDirty;
}

export function prepareDOMSpriteRender(state: DOMRenderState, source: SpriteNode): boolean {
  beginFrame(state);
  const internal = state as DOMRenderStateInternal;
  const container = state.element;
  const tempStack = state.tempStack;

  let stackLength = 1;
  tempStack[0] = source;

  let parentData: SpriteRenderNode | undefined = undefined;
  let lastParent: SpriteNode | null = null;
  let treeDirty = false;

  let newLength = 0;
  let needsReconcile = false;

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as SpriteNode;

    if (!current.enabled) continue;

    if (current !== source) {
      const parent = getSceneParent(current);
      if (parent === null) {
        parentData = undefined;
        lastParent = null;
      } else if (parent !== lastParent) {
        parentData = getOrCreateSpriteRenderNode(state, parent as SpriteNode);
        lastParent = parent as SpriteNode;
      }
    }

    const data = getOrCreateSpriteRenderNode(state, current);

    if (isRenderNodeDirty(state, current, data, parentData)) {
      beginRenderNodeUpdate(current, data);
      updateRenderNodeAppearance(state, data, parentData);
      updateRenderNode2DTransform(state, data, parentData);
      adaptRenderNode(state, current, data);
      treeDirty = true;
    }

    if (!isRenderNodeVisible(data)) continue;

    if (data.renderer !== null) {
      const result = processDOMNode(
        internal,
        data,
        state.currentFrameID,
        () => data.renderer!.draw(state, data),
        newLength,
        isMutableSpriteBatchKind(current.kind),
      );
      newLength = result.newLength;
      if (result.needsReconcile) needsReconcile = true;
    }

    if (data.updateChildren) {
      const children = getSpriteNodeRuntime(current).children;
      if (children !== null) {
        for (let i = children.length - 1; i >= 0; i--) {
          tempStack[stackLength++] = children[i] as SpriteNode;
        }
      }
    }
  }

  if (detectDOMStructureChange(internal, newLength, needsReconcile)) {
    reconcileDOMContainer(container, internal, newLength);
  }

  swapDOMOrderLists(internal, newLength);

  return treeDirty;
}

export function renderDOM(_state: DOMRenderState): void {
  // DOM rendering is fully reconciled during the prepare step.
}

interface DOMClipAction {
  atStackLength: number;
  count: number;
}

function drainDOMClips(
  state: DOMRenderState,
  hooks: DOMRenderStateInternal['domClipHooks'],
  pendingClips: DOMClipAction[],
  stackLength: number,
): void {
  while (pendingClips.length > 0) {
    const top = pendingClips[pendingClips.length - 1];
    if (top.atStackLength < stackLength) break;
    pendingClips.pop();
    hooks!.pop(state, top.count);
  }
}
