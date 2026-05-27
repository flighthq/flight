import type { Sprite } from '@flighthq/engine';
import {
  createCanvasElement,
  createCanvasRenderState,
  defaultCanvasSpriteRenderer,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasSprite,
  SpriteKind,
} from '@flighthq/engine';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createCanvasElement(800, 400, pixelRatio);
document.body.appendChild(canvas);

export const state = createCanvasRenderState(canvas, {
  backgroundColor: 0xeeddccff,
  contextAttributes: { alpha: false },
  imageSmoothingEnabled: false,
});
registerRenderer(state, SpriteKind, defaultCanvasSpriteRenderer);
export const scale = pixelRatio;

export function render(root: Sprite): void {
  renderCanvasBackground(state);
  renderCanvasSprite(state, root);
}
