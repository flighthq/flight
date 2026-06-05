import { isRenderNodeVisible } from '@flighthq/render';
import { getSpriteNodeRuntime } from '@flighthq/scene-sprite';
import type { SpriteNode, SpriteRenderNode, WebGLRenderState } from '@flighthq/types';

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

    const data = state.renderNodeMap.get(current) as SpriteRenderNode | undefined;

    if (data === undefined || !isRenderNodeVisible(data)) continue;

    data.renderer?.draw(internal, data);

    if (data.traverseChildren) {
      const children = getSpriteNodeRuntime(current).children;
      if (children !== null) {
        for (let i = children.length - 1; i >= 0; i--) {
          tempStack[stackLength++] = children[i] as SpriteNode;
        }
      }
    }
  }
}
