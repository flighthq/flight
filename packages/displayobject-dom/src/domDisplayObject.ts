import { getDisplayObjectRuntime } from '@flighthq/displayobject';
import { getRenderProxy2D, isRenderProxyVisible } from '@flighthq/render';
import type { DisplayObject, DomRenderState } from '@flighthq/types';

import { hasDomStructureChanged, processDomNode, reconcileDomContainer, swapDomOrderLists } from './domReconcile';
import { getDomRenderStateRuntime } from './domRenderState';

export function renderDomDisplayObject(state: DomRenderState, source: DisplayObject): void {
  const runtime = getDomRenderStateRuntime(state);
  const container = state.element;
  const clipHooks = state.displayObjectClipHooks;
  const applyClip = runtime.domClipHooks;
  const frameId = runtime.currentFrameId;
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
      const result = processDomNode(runtime, data, frameId, () => data.renderer!.submit(state, data), newLength);
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

  if (hasDomStructureChanged(runtime, newLength, needsReconcile)) {
    reconcileDomContainer(container, runtime, newLength);
  }

  swapDomOrderLists(runtime, newLength);
}
