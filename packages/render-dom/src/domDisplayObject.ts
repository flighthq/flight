import { getOrCreateDisplayObjectRenderNode } from '@flighthq/render-core';
import { getDisplayObjectRuntime } from '@flighthq/scenegraph-display';
import type { DisplayObject, DOMRenderState } from '@flighthq/types';

export function renderDOMDisplayObject(state: DOMRenderState, source: DisplayObject): void {
  const container = state.element;

  // Clear container for this frame's render pass
  while (container.firstChild) container.removeChild(container.firstChild);

  const currentFrameID = state.currentFrameID;
  const tempStack = state.tempStack;
  let stackLength = 0;

  tempStack[stackLength++] = source;

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as DisplayObject;
    const data = getOrCreateDisplayObjectRenderNode(state, current);

    const isMask = data.isMaskFrameID === currentFrameID;
    if (isMask) continue;

    const shouldRender = data.visible && data.alpha > 0 && (data.transform2D.a !== 0 || data.transform2D.d !== 0);
    if (!shouldRender) continue;

    if (data.renderer !== null) {
      data.renderer.draw(state, data);
    }

    const children = getDisplayObjectRuntime(current).children;
    if (children !== null) {
      for (let i = children.length - 1; i >= 0; i--) {
        tempStack[stackLength++] = children[i] as DisplayObject;
      }
    }
  }
}
