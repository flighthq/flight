import { getDisplayObjectRuntime } from '@flighthq/displayobject';
import { getRenderProxy2D, isRenderProxyVisible, noopRendererData } from '@flighthq/render';
import type { DisplayObject, DisplayObjectRenderer, RenderProxy2D, WebGLRenderState } from '@flighthq/types';

import type { WebGLRenderStateInternal } from './internal';
import { flushWebGLSpriteBatch } from './webglSpriteBatch';

export function drawWebGLDisplayObject(_state: WebGLRenderState, _renderProxy: RenderProxy2D): void {
  // Plain display objects have no visual geometry of their own.
}

export function drawWebGLDisplayObjectMask(state: WebGLRenderState, data: RenderProxy2D): void {
  const children = getDisplayObjectRuntime(data.source as DisplayObject).children;
  if (children !== null) {
    for (let i = 0; i < children.length; i++) {
      const child = getRenderProxy2D(state, children[i] as DisplayObject);
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

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as DisplayObject;
    if (!current.enabled) continue;

    const data = getRenderProxy2D(state, current);
    if (data === undefined || data.isMaskFrameID === frameID) continue;

    clipHooks?.popMask(state, data);
    clipHooks?.popClipRectangle(state, data, current);

    if (!isRenderProxyVisible(data)) continue;

    clipHooks?.pushMask(state, current);

    clipHooks?.pushClipRectangle(state, data, current);

    data.renderer?.submit(internal, data);
    if (data.traverseChildren) {
      const children = getDisplayObjectRuntime(current).children;
      if (children !== null) {
        for (let i = children.length - 1; i >= 0; i--) {
          tempStack[stackLength++] = children[i] as DisplayObject;
        }
      }
    }
  }

  flushWebGLSpriteBatch(internal);
  clipHooks?.finalize(state);
}

export const defaultWebGLDisplayObjectRenderer: DisplayObjectRenderer = {
  createData: noopRendererData,
  submit: drawWebGLDisplayObject,
};
