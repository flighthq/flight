import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import { getRenderProxy2D, isRenderProxyVisible } from '@flighthq/render/contract';
import { getNode2DRuntime } from '@flighthq/scene2d/contract';
import type { Node2D, WgpuRenderState } from '@flighthq/types/contract';

import { flushWgpuSpriteBatch } from './wgpuSpriteBatch';

export function renderWgpuSprite(state: WgpuRenderState, source: Node2D): void {
  const tempStack = getWgpuRenderStateRuntime(state).tempStack;
  let stackLength = 1;
  tempStack[0] = source;

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as Node2D;
    if (!current.enabled) continue;
    const data = getRenderProxy2D(state, current);
    if (data === undefined || !isRenderProxyVisible(data)) continue;

    data.renderer?.submit(state, data);

    if (data.traverseChildren) {
      const children = getNode2DRuntime(current).children;
      if (children !== null) {
        for (let i = children.length - 1; i >= 0; i--) {
          tempStack[stackLength++] = children[i] as Node2D;
        }
      }
    }
  }

  flushWgpuSpriteBatch(state);
}
