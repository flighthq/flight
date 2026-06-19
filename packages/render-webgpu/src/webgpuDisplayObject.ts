import { getDisplayObjectRuntime } from '@flighthq/displayobject';
import { getRenderProxy2D, isRenderProxyVisible, noopRendererData } from '@flighthq/render';
import type { DisplayObject, DisplayObjectRenderer, RenderProxy2D, WebGPURenderState } from '@flighthq/types';

import { getWebGPURenderStateRuntime } from './webgpuRenderState';
import { flushWebGPUSpriteBatch } from './webgpuSpriteBatch';

export function drawWebGPUDisplayObject(_state: WebGPURenderState, _renderProxy: RenderProxy2D): void {
  // Plain display objects have no visual geometry of their own.
}

export function renderWebGPUDisplayObject(state: WebGPURenderState, source: DisplayObject): void {
  const tempStack = getWebGPURenderStateRuntime(state).tempStack;
  const clipHooks = state.displayObjectClipHooks;

  let stackLength = 1;
  tempStack[0] = source;

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as DisplayObject;
    if (!current.enabled) continue;

    const data = getRenderProxy2D(state, current);
    if (data === undefined) continue;

    clipHooks?.popClip(state, data, current);

    if (!isRenderProxyVisible(data)) continue;

    clipHooks?.pushClip(state, data, current);

    data.renderer?.submit(state, data);
    if (data.traverseChildren) {
      const children = getDisplayObjectRuntime(current).children;
      if (children !== null) {
        for (let i = children.length - 1; i >= 0; i--) {
          tempStack[stackLength++] = children[i] as DisplayObject;
        }
      }
    }
  }

  flushWebGPUSpriteBatch(state);
  clipHooks?.finalize(state);
}

export const defaultWebGPUDisplayObjectRenderer: DisplayObjectRenderer = {
  createData: noopRendererData,
  submit: drawWebGPUDisplayObject,
};
