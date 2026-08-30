import { webCanvasRenderSurfaceCreator } from '@flighthq/host-web/contract';
import type { Node2D } from '@flighthq/sdk';
import {
  connectCanvasTextureResolverMisses,
  createCanvasTextureResolvers,
  createCanvasShapeRasterizer,
  createDomRenderState,
  defaultCanvasShapeCommands,
  defaultCanvasTextureShapeCommands,
  defaultDomShapeRenderer,
  defaultDomTextLabelRenderer,
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
  TextLabelKind,
} from '@flighthq/sdk';

export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;

const container = document.createElement('div');
container.style.position = 'relative';
container.style.width = CANVAS_WIDTH + 'px';
container.style.height = CANVAS_HEIGHT + 'px';
document.body.appendChild(container);

export const canvas = container;

export const state = createDomRenderState(container, {
  backgroundColor: 0x1a1a2eff,
  sceneGraphSyncPolicy: 'requiresInvalidation',
});
enableFlightDiagnostics(state);

registerRenderer(state, ShapeKind, defaultDomShapeRenderer);

// The GPU mesh lane covers solid fills and open strokes; a closed stroke, a gradient, or a texture fill
// has no tessellated form and draws through this rasterizer instead. Registering it is what keeps a
// shape from silently going missing the moment one is added.
const shapeRasterizerResolvers = createCanvasTextureResolvers(webCanvasRenderSurfaceCreator);
connectCanvasTextureResolverMisses(shapeRasterizerResolvers, state);
registerCanvasImageTextureResolver(shapeRasterizerResolvers);
registerCanvasBitmapTextureResolver(shapeRasterizerResolvers);
registerCanvasShapeCommands(state, defaultCanvasShapeCommands);
registerCanvasShapeCommands(state, defaultCanvasTextureShapeCommands);
registerDomShapeRasterizer(state, createCanvasShapeRasterizer(shapeRasterizerResolvers));
registerRenderer(state, TextLabelKind, defaultDomTextLabelRenderer);

export const scale = 1;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderDomBackground(state);
  renderDomScene2D(state, root);
}
