import { createNullRendererData, getDisplayObjectRenderNode, isRenderNodeVisible } from '@flighthq/render';
import { getDisplayObjectRuntime } from '@flighthq/scene-display';
import type { CanvasRenderState, DisplayObject, DisplayObjectRenderer, DisplayObjectRenderNode } from '@flighthq/types';

export function drawCanvasDisplayObject(_state: CanvasRenderState, _renderNode: DisplayObjectRenderNode): void {
  // Plain display objects have no visual geometry of their own.
}

export function drawCanvasDisplayObjectMask(state: CanvasRenderState, data: DisplayObjectRenderNode): void {
  const children = getDisplayObjectRuntime(data.source as DisplayObject).children;
  if (children !== null) {
    for (let i = 0; i < children.length; i++) {
      const child = getDisplayObjectRenderNode(state, children[i] as DisplayObject);
      if (child !== undefined) state.displayObjectMaskRendererMap.get(child.source.kind)?.drawMask(state, child);
    }
  }
}

export const defaultCanvasDisplayObjectRenderer: DisplayObjectRenderer = {
  createData: createNullRendererData,
  draw: drawCanvasDisplayObject,
};

export function renderCanvasDisplayObject(state: CanvasRenderState, source: DisplayObject): void {
  const tempStack = state.tempStack;
  const frameID = state.currentFrameID;
  const maskHooks = state.displayObjectMaskHooks;
  const scrollRectHooks = state.scrollRectangleHooks;

  let stackLength = 1;
  tempStack[0] = source;
  let currentMaskDepth = 0;
  let currentScrollRectDepth = 0;

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as DisplayObject;

    if (!current.enabled) continue;

    const data = state.renderNodeMap.get(current) as DisplayObjectRenderNode | undefined;
    if (data === undefined) continue;

    if (data.isMaskFrameID === frameID) continue;

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
      const maskData = state.renderNodeMap.get(current.mask) as DisplayObjectRenderNode | undefined;
      if (maskData !== undefined) {
        maskHooks.pushMask(state, maskData);
        currentMaskDepth++;
      }
    }

    if (data.renderer !== null) data.renderer.draw(state, data);

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
}
