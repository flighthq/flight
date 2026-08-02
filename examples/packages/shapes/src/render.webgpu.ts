import type { Node2D } from '@flighthq/sdk';
import {
  createCanvasRenderState,
  createCanvasShapeRasterizer,
  createWgpuCanvasElement,
  createWgpuRenderState,
  defaultWgpuShapeCommands,
  defaultWgpuShapeRenderer,
  enableFlightDiagnostics,
  getCanvasRenderStateTextureResolvers,
  prepareScene2DRender,
  registerCanvasBitmapTextureResolver,
  registerCanvasImageTextureResolver,
  registerRenderer,
  registerWgpuShapeCommands,
  registerWgpuShapeRasterizer,
  registerWgpuStandardMaterial,
  renderWgpuBackground,
  renderWgpuScene2D,
  ShapeKind,
  submitWgpuRenderPass,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x1a1a2eff,
  sceneGraphSyncPolicy: 'requiresInvalidation',
});
enableFlightDiagnostics(state);

registerWgpuStandardMaterial(state);
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
// Gradient and texture fills have no tessellated form on this backend, so they draw through an
// explicit rasterizer whose CanvasRenderState carries the texture resolvers they need.
const shapeRasterizerState = createCanvasRenderState(document.createElement('canvas'));
registerCanvasBitmapTextureResolver(getCanvasRenderStateTextureResolvers(shapeRasterizerState));
registerCanvasImageTextureResolver(getCanvasRenderStateTextureResolvers(shapeRasterizerState));
registerWgpuShapeRasterizer(
  state,
  createCanvasShapeRasterizer(getCanvasRenderStateTextureResolvers(shapeRasterizerState)),
);
registerWgpuShapeCommands(defaultWgpuShapeCommands);

export const scale = pixelRatio;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderWgpuBackground(state);
  renderWgpuScene2D(state, root);
  submitWgpuRenderPass(state);
}
