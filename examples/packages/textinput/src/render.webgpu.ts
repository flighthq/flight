import { webCanvasRenderSurfaceCreator, webHostImage, webRaster2DSurfaceProvider } from '@flighthq/host-web/contract';
import type { Node2D } from '@flighthq/sdk';
import {
  beginWgpuRenderPass,
  connectCanvasTextureResolverMisses,
  createCanvasShapeRasterizer,
  createCanvasTextureResolvers,
  createWgpuAcquisition,
  createWgpuCanvasElement,
  createWgpuRenderState,
  createWgpuScreenRenderTarget,
  defaultCanvasShapeCommands,
  defaultCanvasTextureShapeCommands,
  defaultWgpuRichTextRenderer,
  defaultWgpuShapeRenderer,
  defaultWgpuTextLabelRenderer,
  enableFlightDiagnostics,
  enableWgpuTextInput,
  endWgpuRenderPass,
  prepareScene2DRender,
  registerCanvasBitmapTextureResolver,
  registerCanvasImageTextureResolver,
  registerCanvasShapeCommands,
  registerRenderer,
  registerWgpuShapeRasterizer,
  renderWgpuScene2D,
  RichTextKind,
  scene3DWgpuPipeline,
  ShapeKind,
  TextLabelKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.style.margin = '0';
document.body.appendChild(canvas);

const acquisition = await createWgpuAcquisition(canvas);
if (acquisition === null) throw new Error('WebGPU is unavailable in this environment');
export const screen = createWgpuScreenRenderTarget(acquisition.device, canvas, { format: acquisition.format });
export const state = createWgpuRenderState(acquisition.device, scene3DWgpuPipeline, {
  format: acquisition.format,
  pixelRatio,
  sceneGraphSyncPolicy: 'requiresInvalidation',
  raster2DSurfaceProvider: webRaster2DSurfaceProvider,
});
// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
const screenClear = { color: [0xd0 / 0xff, 0xd0 / 0xff, 0xd0 / 0xff, 1], depth: 1.0 } as const;
enableFlightDiagnostics(state);
registerRenderer(state, RichTextKind, defaultWgpuRichTextRenderer);
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);

// The GPU mesh lane covers solid fills and open strokes; a closed stroke, a gradient, or a texture fill
// has no tessellated form and draws through this rasterizer instead. Registering it is what keeps a
// shape from silently going missing the moment one is added.
const shapeRasterizerResolvers = createCanvasTextureResolvers(webCanvasRenderSurfaceCreator);
connectCanvasTextureResolverMisses(shapeRasterizerResolvers, state);
registerCanvasImageTextureResolver(shapeRasterizerResolvers);
registerCanvasBitmapTextureResolver(webHostImage, shapeRasterizerResolvers);
registerCanvasShapeCommands(state, defaultCanvasShapeCommands);
registerCanvasShapeCommands(state, defaultCanvasTextureShapeCommands);
registerWgpuShapeRasterizer(state, createCanvasShapeRasterizer(shapeRasterizerResolvers));
registerRenderer(state, TextLabelKind, defaultWgpuTextLabelRenderer);
enableWgpuTextInput();

export const scale = pixelRatio;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  const pass = beginWgpuRenderPass(state, screen, screenClear);
  renderWgpuScene2D(pass, root);
  endWgpuRenderPass(pass);
}
