import { getRenderProxy2D, isRenderProxyVisible } from '@flighthq/render';
import { getGlRenderStateRuntime } from '@flighthq/render-gl';
import { getNode2DRuntime } from '@flighthq/scene2d';
import type { Node2D, GlRenderState } from '@flighthq/types';

import { flushGlSpriteBatch } from './glSpriteBatch';

export function renderGlSprite(state: GlRenderState, source: Node2D): void {
  const tempStack = getGlRenderStateRuntime(state).tempStack;
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

  flushGlSpriteBatch(state);
}
