import { renderSpriteTree } from '@flighthq/render';
import type { SpriteNode, WebGLRenderState } from '@flighthq/types';

import type { WebGLRenderStateInternal } from './internal';
import { useWebGLProgram } from './webglDraw';

export function renderWebGLSprite(state: WebGLRenderState, source: SpriteNode): void {
  const internal = state as WebGLRenderStateInternal;
  useWebGLProgram(internal);
  renderSpriteTree(internal, source);
}
