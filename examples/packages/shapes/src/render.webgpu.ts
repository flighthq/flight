import { createWebWgpuCanvasElement } from '@flighthq/host-web';
import { webCanvasRenderSurfaceCreator, webHostImage } from '@flighthq/host-web/contract';
import type { Node2D } from '@flighthq/sdk';
import {
  beginWgpuRenderPass,
  connectCanvasTextureResolverMisses,
  createCanvasShapeRasterizer,
  createCanvasTextureResolvers,
  createWgpuAcquisition,
  createWgpuRenderState,
  createWgpuScreenRenderTarget,
  defaultWgpuShapeCommands,
  defaultWgpuShapeRenderer,
  enableFlightDiagnostics,
  endWgpuRenderPass,
  prepareScene2DRender,
  registerCanvasBitmapTextureResolver,
  registerCanvasImageTextureResolver,
  registerRenderer,
  registerWgpuShapeCommands,
  registerWgpuShapeRasterizer,
  renderWgpuScene2D,
  scene3DWgpuPipeline,
  ShapeKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createWebWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

const acquisition = await createWgpuAcquisition(canvas);
if (acquisition === null) throw new Error('WebGPU is unavailable in this environment');
export const screen = createWgpuScreenRenderTarget(acquisition.device, canvas, { format: acquisition.format });
export const state = createWgpuRenderState(acquisition.device, scene3DWgpuPipeline, {
  format: acquisition.format,
  pixelRatio,
  sceneGraphSyncPolicy: 'requiresInvalidation',
});
// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
const screenClear = { color: [0x1a / 0xff, 0x1a / 0xff, 0x2e / 0xff, 1], depth: 1.0 } as const;
enableFlightDiagnostics(state);
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
// Gradient and texture fills have no tessellated form on this backend, so they draw through an
// explicit rasterizer. It paints into no canvas of its own, so it carries a resolution set
// rather than a render state, and that set is pointed at this state's diagnostics.
const shapeRasterizerResolvers = createCanvasTextureResolvers(webCanvasRenderSurfaceCreator);
connectCanvasTextureResolverMisses(shapeRasterizerResolvers, state);
registerCanvasBitmapTextureResolver(webHostImage, shapeRasterizerResolvers);
registerCanvasImageTextureResolver(shapeRasterizerResolvers);
registerWgpuShapeRasterizer(state, createCanvasShapeRasterizer(shapeRasterizerResolvers));
registerWgpuShapeCommands(state, defaultWgpuShapeCommands);

export const scale = pixelRatio;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  const pass = beginWgpuRenderPass(state, screen, screenClear);
  renderWgpuScene2D(pass, root);
  endWgpuRenderPass(pass);
}
