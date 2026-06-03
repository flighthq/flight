import { getOrCreateSpriteRenderNode } from '@flighthq/render';
import { getSpriteNodeRuntime } from '@flighthq/scene-sprite';
import type { SpriteNode, WebGLRenderState } from '@flighthq/types';

import type { WebGLRenderStateInternal } from './internal';
import { useWebGLProgram } from './webglDraw';

export function renderWebGLSprite(state: WebGLRenderState, source: SpriteNode): void {
  const internal = state as WebGLRenderStateInternal;
  const tempStack = state.tempStack;
  let stackLength = 0;

  useWebGLProgram(internal);

  tempStack[stackLength++] = source;

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as SpriteNode;
    const data = getOrCreateSpriteRenderNode(state, current);

    const shouldRender = data.visible && data.alpha > 0 && (data.transform2D.a !== 0 || data.transform2D.d !== 0);
    if (!shouldRender) continue;

    if (data.renderer !== null) {
      data.renderer.draw(internal, data);
    }

    if (!data.updateChildren) continue;

    const children = getSpriteNodeRuntime(current).children;
    if (children !== null) {
      for (let i = children.length - 1; i >= 0; i--) {
        tempStack[stackLength++] = children[i] as SpriteNode;
      }
    }
  }
}
