import type { Sprite } from '@flighthq/sdk';
import {
  createCanvasElement,
  createCanvasRenderState,
  defaultCanvasSpriteRenderer,
  prepareCanvasSpriteRender,
  registerRenderer,
  renderCanvas,
  renderCanvasBackground,
  SpriteKind,
} from '@flighthq/sdk';

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
  if (!prepareCanvasSpriteRender(state, root)) return;
  renderCanvasBackground(state);
  renderCanvas(state);
}
