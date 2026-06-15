import { getDisplayObjectRuntime } from '@flighthq/displayobject';
import { getDisplayObjectRenderNode, isRenderNodeVisible } from '@flighthq/render';
import type { DisplayObject, DOMRenderState } from '@flighthq/types';

import { detectDOMStructureChange, processDOMNode, reconcileDOMContainer, swapDOMOrderLists } from './domReconcile';
import type { DOMRenderStateInternal } from './internal';

export function renderDOMDisplayObject(state: DOMRenderState, source: DisplayObject): void {
  const internal = state as DOMRenderStateInternal;
  const container = state.element;
  const clipHooks = state.displayObjectClipHooks;
  const applyClip = internal.domClipHooks;
  const frameID = state.currentFrameID;
  const tempStack = state.tempStack;

  let stackLength = 1;
  tempStack[0] = source;
  let newLength = 0;
  let needsReconcile = false;

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as DisplayObject;
    if (!current.enabled) continue;

    const data = getDisplayObjectRenderNode(state, current);
    if (data === undefined || data.isMaskFrameID === frameID) continue;

    clipHooks?.popMask(state, data);
    clipHooks?.popClipRectangle(state, data);

    if (!isRenderNodeVisible(data)) continue;

    clipHooks?.pushMask(state, current);

    if (data.renderer !== null) {
      const result = processDOMNode(internal, data, frameID, () => data.renderer!.submit(state, data), newLength);
      newLength = result.newLength;
      if (result.needsReconcile) needsReconcile = true;
      applyClip?.apply(state, data);
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

    clipHooks?.pushClipRectangle(state, data, current, stackLength > prePushLength);
  }

  clipHooks?.finalize(state);

  if (detectDOMStructureChange(internal, newLength, needsReconcile)) {
    reconcileDOMContainer(container, internal, newLength);
  }

  swapDOMOrderLists(internal, newLength);
}
