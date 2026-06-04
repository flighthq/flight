import type { Sprite } from '@flighthq/sdk';
import {
  createWebGLElement,
  createWebGLRenderState,
  defaultWebGLSpriteRenderer,
  prepareWebGLSpriteRender,
  registerRenderer,
  renderWebGL,
  renderWebGLBackground,
  SpriteKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWebGLElement(800, 400, pixelRatio);
document.body.appendChild(canvas);

export const state = createWebGLRenderState(canvas, {
  backgroundColor: 0xeeddccff,
  contextAttributes: { alpha: false },
  imageSmoothingEnabled: false,
});
registerRenderer(state, SpriteKind, defaultWebGLSpriteRenderer);
export const scale = pixelRatio;

export function render(root: Sprite): void {
  if (!prepareWebGLSpriteRender(state, root)) return;
  renderWebGLBackground(state);
  renderWebGL(state);
}
