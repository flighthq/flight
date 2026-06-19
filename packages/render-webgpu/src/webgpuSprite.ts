import { getDisplayObjectRuntime } from '@flighthq/displayobject';
import { getRenderProxy2D, isRenderProxyVisible } from '@flighthq/render';
import type { DisplayObject, WebGPURenderState } from '@flighthq/types';

import { getWebGPURenderStateRuntime } from './webgpuRenderState';
import { flushWebGPUSpriteBatch } from './webgpuSpriteBatch';

export function renderWebGPUSprite(state: WebGPURenderState, source: DisplayObject): void {
  const tempStack = getWebGPURenderStateRuntime(state).tempStack;
  let stackLength = 1;
  tempStack[0] = source;

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as DisplayObject;
    if (!current.enabled) continue;
    const data = getRenderProxy2D(state, current);
    if (data === undefined || !isRenderProxyVisible(data)) continue;

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
}
