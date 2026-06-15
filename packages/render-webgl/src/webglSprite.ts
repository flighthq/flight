import { getSpriteRenderNode, isRenderNodeVisible } from '@flighthq/render';
import { getSpriteNodeRuntime } from '@flighthq/sprite';
import type { SpriteNode, WebGLRenderState } from '@flighthq/types';

import type { WebGLRenderStateInternal } from './internal';
import { flushWebGLSpriteBatch } from './webglSpriteBatch';

export function renderWebGLSprite(state: WebGLRenderState, source: SpriteNode): void {
  const internal = state as WebGLRenderStateInternal;
  const tempStack = state.tempStack;
  let stackLength = 1;
  tempStack[0] = source;

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as SpriteNode;
    if (!current.enabled) continue;
    const data = getSpriteRenderNode(state, current);
    if (data === undefined || !isRenderNodeVisible(data)) continue;

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

  flushWebGLSpriteBatch(internal);
}
