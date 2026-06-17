import { getDisplayObjectRuntime } from '@flighthq/displayobject';
import { getRenderProxy2D, isRenderProxyVisible, noopRendererData } from '@flighthq/render';
import type { DisplayObject, DisplayObjectRenderer, RenderProxy2D, WebGPURenderState } from '@flighthq/types';

import type { WebGPURenderStateInternal } from './internal';
import { flushWebGPUSpriteBatch } from './webgpuSpriteBatch';

export function drawWebGPUDisplayObject(_state: WebGPURenderState, _renderProxy: RenderProxy2D): void {
  // Plain display objects have no visual geometry of their own.
}

export function drawWebGPUDisplayObjectMask(state: WebGPURenderState, data: RenderProxy2D): void {
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

export function renderWebGPUDisplayObject(state: WebGPURenderState, source: DisplayObject): void {
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
    clipHooks?.popClipRectangle(state, data);

    if (!isRenderProxyVisible(data)) continue;

    clipHooks?.pushMask(state, current);

    data.renderer?.submit(state, data);

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

  flushWebGPUSpriteBatch(state as WebGPURenderStateInternal);
  clipHooks?.finalize(state);
}

export const defaultWebGPUDisplayObjectRenderer: DisplayObjectRenderer = {
  createData: noopRendererData,
  submit: drawWebGPUDisplayObject,
};
