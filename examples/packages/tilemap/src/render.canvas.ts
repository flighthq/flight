import type { Node2D } from '@flighthq/sdk';
import {
  SpriteKind,
  TilemapKind,
  createCanvasElement,
  createCanvasRenderState,
  defaultCanvasSpriteRenderer,
  defaultCanvasTilemapRenderer,
  prepareScene2DRender,
  registerCanvasImageTextureResolver,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasScene2D,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createCanvasRenderState(canvas, {
  sceneGraphSyncPolicy: 'requiresInvalidation',
  backgroundColor: 0x1a1a2eff,
});

registerCanvasImageTextureResolver(state);
registerRenderer(state, SpriteKind, defaultCanvasSpriteRenderer);
registerRenderer(state, TilemapKind, defaultCanvasTilemapRenderer);

export const scale = pixelRatio;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderCanvasBackground(state);
  renderCanvasScene2D(state, root);
}
