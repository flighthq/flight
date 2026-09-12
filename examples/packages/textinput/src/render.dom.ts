import { webCanvasRenderSurfaceCreator, webHostImage } from '@flighthq/host-web/contract';
import type { Node2D } from '@flighthq/sdk';
import {
  connectCanvasTextureResolverMisses,
  createCanvasShapeRasterizer,
  createCanvasTextureResolvers,
  createDomRenderState,
  defaultCanvasShapeCommands,
  defaultCanvasTextureShapeCommands,
  defaultDomRichTextRenderer,
  defaultDomShapeRenderer,
  defaultDomTextLabelRenderer,
  enableDomTextInput,
  enableFlightDiagnostics,
  prepareScene2DRender,
  registerCanvasBitmapTextureResolver,
  registerCanvasImageTextureResolver,
  registerCanvasShapeCommands,
  registerDomShapeRasterizer,
  registerRenderer,
  renderDomScene2D,
  RichTextKind,
  ShapeKind,
  TextLabelKind,
} from '@flighthq/sdk';

const container = document.createElement('div');
container.style.position = 'relative';
container.style.width = '800px';
container.style.height = '600px';
document.body.style.margin = '0';
document.body.appendChild(container);

export const state = createDomRenderState(container, { sceneGraphSyncPolicy: 'requiresInvalidation' });
// DOM has no pass and no clear: the background is a CSS property on the element the caller
// already holds, set once rather than reapplied by a render function every frame.
container.style.backgroundColor = '#d0d0d0';
enableFlightDiagnostics(state);

registerRenderer(state, RichTextKind, defaultDomRichTextRenderer);
registerRenderer(state, ShapeKind, defaultDomShapeRenderer);

// The GPU mesh lane covers solid fills and open strokes; a closed stroke, a gradient, or a texture fill
// has no tessellated form and draws through this rasterizer instead. Registering it is what keeps a
// shape from silently going missing the moment one is added.
const shapeRasterizerResolvers = createCanvasTextureResolvers(webCanvasRenderSurfaceCreator);
connectCanvasTextureResolverMisses(shapeRasterizerResolvers, state);
registerCanvasImageTextureResolver(shapeRasterizerResolvers);
registerCanvasBitmapTextureResolver(webHostImage, shapeRasterizerResolvers);
registerCanvasShapeCommands(state, defaultCanvasShapeCommands);
registerCanvasShapeCommands(state, defaultCanvasTextureShapeCommands);
registerDomShapeRasterizer(state, createCanvasShapeRasterizer(shapeRasterizerResolvers));
registerRenderer(state, TextLabelKind, defaultDomTextLabelRenderer);
enableDomTextInput();

export const canvas: HTMLElement = container;

export const scale = 1;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderDomScene2D(state, root);
}
