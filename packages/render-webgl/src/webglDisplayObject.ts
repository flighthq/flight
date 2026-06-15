import { getDisplayObjectRuntime } from '@flighthq/displayobject';
import { getDisplayObjectRenderNode, isRenderNodeVisible, noopRendererData } from '@flighthq/render';
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
  const clipHooks = state.displayObjectClipHooks;

  let stackLength = 1;
  tempStack[0] = source;

  useWebGLProgram(internal);

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as DisplayObject;
    if (!current.enabled) continue;

    const data = getDisplayObjectRenderNode(state, current);
    if (data === undefined || data.isMaskFrameID === frameID) continue;

    clipHooks?.popMask(state, data);
    clipHooks?.popClipRectangle(state, data);

    if (!isRenderNodeVisible(data)) continue;

    clipHooks?.pushMask(state, current);

    data.renderer?.submit(internal, data);

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
}

export const defaultWebGLDisplayObjectRenderer: DisplayObjectRenderer = {
  createData: noopRendererData,
  submit: drawWebGLDisplayObject,
};
