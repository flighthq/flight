import { webCanvasRenderSurfaceCreator } from '@flighthq/host-web/contract';
import type { Node2D } from '@flighthq/sdk';
import {
  createCanvasElement,
  createCanvasRenderSurface,
  createCanvasTextureResolvers,
  scene2dCanvasPipeline,
  createCanvasRenderState,
  defaultCanvasSpriteRenderer,
  defaultCanvasTilemapRenderer,
  enableFlightDiagnostics,
  getCanvasRenderStateTextureResolvers,
  prepareScene2DRender,
  registerCanvasImageTextureResolver,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasScene2D,
  SpriteKind,
  TilemapKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createCanvasElement(webCanvasRenderSurfaceCreator, 800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createCanvasRenderState(
  createCanvasRenderSurface(webCanvasRenderSurfaceCreator, canvas, {
    height: canvas.height / pixelRatio,
    pixelRatio,
    width: canvas.width / pixelRatio,
  }),
  scene2dCanvasPipeline,
  createCanvasTextureResolvers(webCanvasRenderSurfaceCreator),
  {
    sceneGraphSyncPolicy: 'requiresInvalidation',
    backgroundColor: 0x1a1a2eff,
  },
);
enableFlightDiagnostics(state);

registerCanvasImageTextureResolver(getCanvasRenderStateTextureResolvers(state));
registerRenderer(state, SpriteKind, defaultCanvasSpriteRenderer);
registerRenderer(state, TilemapKind, defaultCanvasTilemapRenderer);

export const scale = pixelRatio;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderCanvasBackground(state);
  renderCanvasScene2D(state, root);
}
