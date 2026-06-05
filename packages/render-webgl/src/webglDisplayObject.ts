import { createNullRendererData, getOrCreateDisplayObjectRenderNode, isRenderNodeVisible } from '@flighthq/render';
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
      const child = getOrCreateDisplayObjectRenderNode(state, children[i] as DisplayObject);
      state.displayObjectMaskRendererMap.get(child.source.kind)?.drawMask(state, child);
    }
  }
}

export function renderWebGLDisplayObject(state: WebGLRenderState, source: DisplayObject): void {
  const internal = state as WebGLRenderStateInternal;
  const tempStack = state.tempStack;
  let stackLength = 0;

  useWebGLProgram(internal);

  tempStack[stackLength++] = source;

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as DisplayObject;

    if (!current.enabled) continue;

    const data = getOrCreateDisplayObjectRenderNode(state, current);

    if (!isRenderNodeVisible(data)) continue;

    data.renderer?.draw(internal, data);

    if (data.traverseChildren) {
      const children = getDisplayObjectRuntime(current).children;
      if (children !== null) {
        for (let i = children.length - 1; i >= 0; i--) {
          tempStack[stackLength++] = children[i] as DisplayObject;
        }
      }
    }
  }
}

export const defaultWebGLDisplayObjectRenderer: DisplayObjectRenderer = {
  createData: createNullRendererData,
  draw: drawWebGLDisplayObject,
};
