import {
  webHostWgpuContext,
  webCanvasRenderSurfaceCreator,
  webHostImage,
  webImageSurfaceCreator,
  appendWebSurface,
  getWebSurfaceElement,
  webHostSurfaceDisplay,
  webHostWindowGeometry,
  webHostWindowLifecycle,
} from '@flighthq/host-web/contract';
import type { Node2D } from '@flighthq/sdk';
import {
  beginWgpuRenderPass,
  connectCanvasTextureResolverMisses,
  createCanvasShapeRasterizer,
  createCanvasTextureResolvers,
  createWgpuRenderState,
  createWgpuScreenRenderTarget,
  defaultCanvasShapeCommands,
  defaultCanvasTextureShapeCommands,
  defaultWgpuShapeRenderer,
  defaultWgpuTextLabelRenderer,
  enableFlightDiagnostics,
  endWgpuRenderPass,
  prepareScene2DRender,
  registerCanvasBitmapTextureResolver,
  registerCanvasImageTextureResolver,
  registerCanvasShapeCommands,
  registerRenderer,
  registerWgpuShapeRasterizer,
  renderWgpuScene2D,
  defaultScene3DWgpuRenderRegistries,
  ShapeKind,
  TextLabelKind,
  createWgpuSurface,
  setSurfaceDisplaySize,
  createAppWindow,
  openWindow,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const appWindow = createAppWindow();
openWindow(webHostWindowLifecycle, webHostWindowGeometry, appWindow, {});
const wgpuSurface = await createWgpuSurface(webHostWgpuContext, appWindow, 800 * pixelRatio, 500 * pixelRatio);
if (wgpuSurface === null) throw new Error('WebGPU is unavailable in this environment');
setSurfaceDisplaySize(webHostSurfaceDisplay, wgpuSurface, 800, 500);
appendWebSurface(wgpuSurface, document.body);
export const canvas = getWebSurfaceElement(wgpuSurface)!;
const acquisition = wgpuSurface.acquisition;
export const screen = createWgpuScreenRenderTarget(webHostWgpuContext, acquisition.device, wgpuSurface, {
  format: acquisition.format,
});
export const state = createWgpuRenderState(acquisition.device, defaultScene3DWgpuRenderRegistries, {
  format: acquisition.format,
  pixelRatio,
  sceneGraphSyncPolicy: 'requiresInvalidation',
  imageSurfaceProvider: webImageSurfaceCreator,
});
// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
const screenClear = { color: [0x15 / 0xff, 0x1b / 0xff, 0x2b / 0xff, 1], depth: 1.0 } as const;
enableFlightDiagnostics(state);
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

export const scale = pixelRatio;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  const pass = beginWgpuRenderPass(state, screen, screenClear);
  renderWgpuScene2D(pass, root);
  endWgpuRenderPass(pass);
}
