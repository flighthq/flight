import { webCanvasRenderSurfaceCreator, webHostImage } from '@flighthq/host-web/contract';
import type { Node2D } from '@flighthq/sdk';
import {
  connectCanvasTextureResolverMisses,
  createCanvasShapeRasterizer,
  createCanvasTextureResolvers,
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
  renderDomScene2D,
  ShapeKind,
} from '@flighthq/sdk';

const container = document.createElement('div');
container.style.position = 'relative';
container.style.width = '800px';
container.style.height = '600px';
document.body.appendChild(container);

export const state = createDomRenderState(container, { sceneGraphSyncPolicy: 'requiresInvalidation' });
// DOM has no pass and no clear: the background is a CSS property on the element the caller
// already holds, set once rather than reapplied by a render function every frame.
container.style.backgroundColor = '#1a1a2e';
enableFlightDiagnostics(state);

registerRenderer(state, ShapeKind, defaultDomShapeRenderer);
// Gradient and texture fills have no tessellated form on this backend, so they draw through an
// explicit rasterizer. It paints into no canvas of its own, so it carries a resolution set
// rather than a render state, and that set is pointed at this state's diagnostics.
const shapeRasterizerResolvers = createCanvasTextureResolvers(webCanvasRenderSurfaceCreator);
connectCanvasTextureResolverMisses(shapeRasterizerResolvers, state);
registerCanvasBitmapTextureResolver(webHostImage, shapeRasterizerResolvers);
registerCanvasImageTextureResolver(shapeRasterizerResolvers);
registerDomShapeRasterizer(state, createCanvasShapeRasterizer(shapeRasterizerResolvers));
registerCanvasShapeCommands(state, defaultCanvasShapeCommands);

export const canvas: HTMLElement = container;

export const scale = 1;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderDomScene2D(state, root);
}
