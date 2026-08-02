import type { Node2D } from '@flighthq/sdk';
import {
  createCanvasRenderState,
  createCanvasShapeRasterizer,
  createDomRenderState,
  defaultCanvasShapeCommands,
  defaultDomShapeRenderer,
  enableFlightDiagnostics,
  prepareScene2DRender,
  registerCanvasBitmapTextureResolver,
  registerCanvasImageTextureResolver,
  registerCanvasShapeCommands,
  registerDomShapeRasterizer,
  registerRenderer,
  renderDomBackground,
  renderDomScene2D,
  ShapeKind,
} from '@flighthq/sdk';

const container = document.createElement('div');
container.style.position = 'relative';
container.style.width = '800px';
container.style.height = '600px';
document.body.appendChild(container);

export const state = createDomRenderState(container, {
  backgroundColor: 0x1a1a2eff,
  sceneGraphSyncPolicy: 'requiresInvalidation',
});
enableFlightDiagnostics(state);

registerRenderer(state, ShapeKind, defaultDomShapeRenderer);
// Gradient and texture fills have no tessellated form on this backend, so they draw through an
// explicit rasterizer whose CanvasRenderState carries the texture resolvers they need.
const shapeRasterizerState = createCanvasRenderState(document.createElement('canvas'));
registerCanvasBitmapTextureResolver(shapeRasterizerState);
registerCanvasImageTextureResolver(shapeRasterizerState);
registerDomShapeRasterizer(state, createCanvasShapeRasterizer(shapeRasterizerState));
registerCanvasShapeCommands(defaultCanvasShapeCommands);

export const canvas: HTMLElement = container;

export const scale = 1;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderDomBackground(state);
  renderDomScene2D(state, root);
}
