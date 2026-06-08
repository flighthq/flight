import type { Tilemap } from '@flighthq/sdk';
import {
  createWebGLElement,
  createWebGLRenderState,
  defaultWebGLTilemapRenderer,
  prepareSpriteRender,
  registerRenderer,
  renderWebGLBackground,
  renderWebGLSprite,
  TilemapKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWebGLElement(592, 592, pixelRatio);
document.getElementById('app')!.appendChild(canvas);

export const state = createWebGLRenderState(canvas, {
  backgroundColor: 0xeeddccff,
  imageSmoothingEnabled: false,
});
registerRenderer(state, TilemapKind, defaultWebGLTilemapRenderer);
export const scale = pixelRatio;

export function render(root: Tilemap): void {
  if (!prepareSpriteRender(state, root)) return;
  renderWebGLBackground(state);
  renderWebGLSprite(state, root);
}
