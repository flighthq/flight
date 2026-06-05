import { createNullRendererData, getDisplayObjectRenderNode, isRenderNodeVisible } from '@flighthq/render';
import { getDisplayObjectRuntime } from '@flighthq/scene-display';
import type { DisplayObject, DisplayObjectRenderer, DisplayObjectRenderNode, WebGLRenderState } from '@flighthq/types';

import type { WebGLRenderStateInternal } from './internal';
import { useWebGLProgram } from './webglDraw';

export function drawWebGLDisplayObject(_state: WebGLRenderState, _renderNode: DisplayObjectRenderNode): void {
  // Plain display objects have no visual geometry of their own.
}

export function drawWebGLDisplayObjectMask(state: WebGLRenderState, data: DisplayObjectRenderNode): void {
  const children = getDisplayObjectRuntime(data.source as DisplayObject).children;
  if (children !== null) {
    for (let i = 0; i < children.length; i++) {
      const child = getDisplayObjectRenderNode(state, children[i] as DisplayObject);
      if (child !== undefined) {
        state.displayObjectMaskRendererMap.get(child.source.kind)?.drawMask(state, child);
      }
    }
  }
}

export function renderWebGLDisplayObject(state: WebGLRenderState, source: DisplayObject): void {
  const internal = state as WebGLRenderStateInternal;
  const frameID = state.currentFrameID;
  const tempStack = state.tempStack;
  const maskHooks = state.displayObjectMaskHooks;
  const scrollRectHooks = state.scrollRectangleHooks;

  let stackLength = 1;
  tempStack[0] = source;
  let currentMaskDepth = 0;
  let currentScrollRectDepth = 0;

  useWebGLProgram(internal);

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

    data.renderer?.draw(internal, data);

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

export const defaultWebGLDisplayObjectRenderer: DisplayObjectRenderer = {
  createData: createNullRendererData,
  draw: drawWebGLDisplayObject,
};
