import type { Sprite } from '@flighthq/sdk';
import {
  createCanvasElement,
  createCanvasRenderState,
  defaultCanvasSpriteRenderer,
  prepareSpriteRender,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasSprite,
  SpriteKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createCanvasElement(800, 400, pixelRatio);
document.body.appendChild(canvas);

export const state = createCanvasRenderState(canvas, {
  backgroundColor: 0xeeddccff,
  imageSmoothingEnabled: false,
});
registerRenderer(state, SpriteKind, defaultCanvasSpriteRenderer);
export const scale = pixelRatio;

export function render(root: Sprite): void {
  if (!prepareSpriteRender(state, root)) return;
  renderCanvasBackground(state);
  renderCanvasSprite(state, root);
}
