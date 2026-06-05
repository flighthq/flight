import { getDisplayObjectRenderNode, isRenderNodeVisible } from '@flighthq/render';
import { getDisplayObjectRuntime } from '@flighthq/scene-display';
import type { DisplayObject, DOMRenderState } from '@flighthq/types';

import { detectDOMStructureChange, processDOMNode, reconcileDOMContainer, swapDOMOrderLists } from './domReconcile';
import type { DOMRenderStateInternal } from './internal';

export function renderDOMDisplayObject(state: DOMRenderState, source: DisplayObject): void {
  const internal = state as DOMRenderStateInternal;
  const container = state.element;
  const hooks = internal.domClipHooks;
  const frameID = state.currentFrameID;
  const tempStack = state.tempStack;

  let stackLength = 1;
  tempStack[0] = source;

  let newLength = 0;
  let needsReconcile = false;
  let currentClipDepth = 0;

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as DisplayObject;

    if (!current.enabled) continue;

    const data = getDisplayObjectRenderNode(state, current);
    if (data === undefined || data.isMaskFrameID === frameID) continue;

    if (hooks !== null) {
      const targetDepth = data.maskDepth + data.scrollRectangleDepth;
      if (currentClipDepth > targetDepth) {
        hooks.pop(state, currentClipDepth - targetDepth);
        currentClipDepth = targetDepth;
      }
    }

    if (!isRenderNodeVisible(data)) continue;

    let pushed = 0;
    if (hooks !== null) pushed = hooks.push(state, data);
    currentClipDepth += pushed;

    if (data.renderer !== null) {
      const result = processDOMNode(internal, data, frameID, () => data.renderer!.draw(state, data), newLength);
      newLength = result.newLength;
      if (result.needsReconcile) needsReconcile = true;
      if (hooks !== null) hooks.apply(state, data);
    }

    if (data.traverseChildren) {
      const children = getDisplayObjectRuntime(current).children;
      if (children !== null) {
        for (let i = children.length - 1; i >= 0; i--) {
          tempStack[stackLength++] = children[i] as DisplayObject;
        }
      }
    }
  }

  if (hooks !== null && currentClipDepth > 0) hooks.pop(state, currentClipDepth);

  if (detectDOMStructureChange(internal, newLength, needsReconcile)) {
    reconcileDOMContainer(container, internal, newLength);
  }

  swapDOMOrderLists(internal, newLength);
}
