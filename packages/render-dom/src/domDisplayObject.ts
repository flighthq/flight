import { getDisplayObjectRenderNode, isRenderNodeVisible } from '@flighthq/render';
import { getDisplayObjectRuntime } from '@flighthq/scene-display';
import type { DisplayObject, DOMRenderState } from '@flighthq/types';

import { detectDOMStructureChange, processDOMNode, reconcileDOMContainer, swapDOMOrderLists } from './domReconcile';
import type { DOMRenderStateInternal } from './internal';

export function renderDOMDisplayObject(state: DOMRenderState, source: DisplayObject): void {
  const internal = state as DOMRenderStateInternal;
  const container = state.element;
  const maskHooks = state.displayObjectMaskHooks;
  const scrollRectHooks = state.scrollRectangleHooks;
  const clipHooks = internal.domClipHooks;
  const frameID = state.currentFrameID;
  const tempStack = state.tempStack;

  let stackLength = 1;
  tempStack[0] = source;

  let newLength = 0;
  let needsReconcile = false;
  let currentMaskDepth = 0;
  let currentScrollRectDepth = 0;

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as DisplayObject;

    if (!current.enabled) continue;

    const data = getDisplayObjectRenderNode(state, current);
    if (data === undefined || data.isMaskFrameID === frameID) continue;

    while (maskHooks !== null && currentMaskDepth > data.maskDepth) {
      maskHooks.popMask(state);
      currentMaskDepth--;
    }
    while (scrollRectHooks !== null && currentScrollRectDepth > data.scrollRectangleDepth) {
      scrollRectHooks.pop(state);
      currentScrollRectDepth--;
    }

    if (!isRenderNodeVisible(data)) continue;

    if (maskHooks !== null && current.mask !== null) {
      const maskData = getDisplayObjectRenderNode(state, current.mask);
      if (maskData !== undefined) {
        maskHooks.pushMask(state, maskData);
        currentMaskDepth++;
      }
    }

    if (data.renderer !== null) {
      const result = processDOMNode(internal, data, frameID, () => data.renderer!.draw(state, data), newLength);
      newLength = result.newLength;
      if (result.needsReconcile) needsReconcile = true;
      if (clipHooks !== null) clipHooks.apply(state, data);
    }

    const prePushLength = stackLength;

    if (data.traverseChildren) {
      const children = getDisplayObjectRuntime(current).children;
      if (children !== null) {
        for (let i = children.length - 1; i >= 0; i--) {
          tempStack[stackLength++] = children[i] as DisplayObject;
        }
      }
    }

    if (scrollRectHooks !== null && current.scrollRectangle !== null && stackLength > prePushLength) {
      scrollRectHooks.push(state, data);
      currentScrollRectDepth++;
    }
  }

  while (currentMaskDepth-- > 0) maskHooks!.popMask(state);
  while (currentScrollRectDepth-- > 0) scrollRectHooks!.pop(state);

  if (detectDOMStructureChange(internal, newLength, needsReconcile)) {
    reconcileDOMContainer(container, internal, newLength);
  }

  swapDOMOrderLists(internal, newLength);
}
