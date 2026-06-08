import type { Tilemap } from '@flighthq/sdk';
import {
  createCanvasElement,
  createCanvasRenderState,
  defaultCanvasTilemapRenderer,
  prepareSpriteRender,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasSprite,
  TilemapKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createCanvasElement(592, 592, pixelRatio);
document.getElementById('app')!.appendChild(canvas);

export const state = createCanvasRenderState(canvas, {
  backgroundColor: 0xeeddccff,
  imageSmoothingEnabled: false,
});
registerRenderer(state, TilemapKind, defaultCanvasTilemapRenderer);
export const scale = pixelRatio;

export function render(root: Tilemap): void {
  if (!prepareSpriteRender(state, root)) return;
  renderCanvasBackground(state);
  renderCanvasSprite(state, root);
}
