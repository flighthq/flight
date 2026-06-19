import { getDisplayObjectRuntime } from '@flighthq/displayobject';
import { getRenderProxy2D, isRenderProxyVisible } from '@flighthq/render';
import type { DisplayObject, DOMRenderState } from '@flighthq/types';

import { hasDOMStructureChanged, processDOMNode, reconcileDOMContainer, swapDOMOrderLists } from './domReconcile';
import { getDOMRenderStateRuntime } from './domRenderState';

export function renderDOMDisplayObject(state: DOMRenderState, source: DisplayObject): void {
  const runtime = getDOMRenderStateRuntime(state);
  const container = state.element;
  const clipHooks = state.displayObjectClipHooks;
  const applyClip = runtime.domClipHooks;
  const frameID = runtime.currentFrameID;
  const tempStack = runtime.tempStack;

  let stackLength = 1;
  tempStack[0] = source;
  let newLength = 0;
  let needsReconcile = false;

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as DisplayObject;
    if (!current.enabled) continue;

    const data = getRenderProxy2D(state, current);
    if (data === undefined) continue;

    clipHooks?.popClip(state, data, current);

    if (!isRenderProxyVisible(data)) continue;

    clipHooks?.pushClip(state, data, current);

    if (data.renderer !== null) {
      const result = processDOMNode(runtime, data, frameID, () => data.renderer!.submit(state, data), newLength);
      newLength = result.newLength;
      if (result.needsReconcile) needsReconcile = true;
      applyClip?.apply(state, data);
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

  clipHooks?.finalize(state);

  if (hasDOMStructureChanged(runtime, newLength, needsReconcile)) {
    reconcileDOMContainer(container, runtime, newLength);
  }

  swapDOMOrderLists(runtime, newLength);
}
