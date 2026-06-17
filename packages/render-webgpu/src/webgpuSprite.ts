import { getRenderProxy2D, isRenderProxyVisible } from '@flighthq/render';
import { getSpriteNodeRuntime } from '@flighthq/sprite';
import type { SpriteNode, WebGPURenderState } from '@flighthq/types';

import type { WebGPURenderStateInternal } from './internal';
import { flushWebGPUSpriteBatch } from './webgpuSpriteBatch';

export function renderWebGPUSprite(state: WebGPURenderState, source: SpriteNode): void {
  const internal = state as WebGPURenderStateInternal;
  const tempStack = state.tempStack;
  let stackLength = 1;
  tempStack[0] = source;

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as SpriteNode;
    if (!current.enabled) continue;
    const data = getRenderProxy2D(state, current);
    if (data === undefined || !isRenderProxyVisible(data)) continue;

    data.renderer?.submit(internal, data);

    if (data.traverseChildren) {
      const children = getSpriteNodeRuntime(current).children;
      if (children !== null) {
        for (let i = children.length - 1; i >= 0; i--) {
          tempStack[stackLength++] = children[i] as SpriteNode;
        }
      }
    }
  }

  flushWebGPUSpriteBatch(internal);
}
