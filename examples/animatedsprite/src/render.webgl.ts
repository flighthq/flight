import type { Sprite } from '@flighthq/sdk';
import {
  createWebGLCanvasElement,
  createWebGLRenderState,
  defaultWebGLSpriteRenderer,
  prepareSpriteRender,
  registerRenderer,
  renderWebGLBackground,
  renderWebGLSprite,
  SpriteKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWebGLCanvasElement(800, 400, pixelRatio);
document.body.appendChild(canvas);

export const state = createWebGLRenderState(canvas, {
  sceneGraphSyncPolicy: 'requiresInvalidation',
  backgroundColor: 0xeeddccff,
  imageSmoothingEnabled: false,
});
registerRenderer(state, SpriteKind, defaultWebGLSpriteRenderer);
export const scale = pixelRatio;

export function render(root: Sprite): void {
  if (!prepareSpriteRender(state, root)) return;
  renderWebGLBackground(state);
  renderWebGLSprite(state, root);
}
