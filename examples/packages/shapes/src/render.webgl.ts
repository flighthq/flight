import { createWebGlContext, webCanvasRenderSurfaceCreator, webHostImage } from '@flighthq/host-web/contract';
import type { Node2D } from '@flighthq/sdk';
import {
  scene3DGlPipeline,
  connectCanvasTextureResolverMisses,
  createCanvasTextureResolvers,
  createCanvasShapeRasterizer,
  createGlCanvasElement,
  createGlRenderState,
  defaultGlShapeCommands,
  defaultGlShapeRenderer,
  enableFlightDiagnostics,
  prepareScene2DRender,
  registerCanvasBitmapTextureResolver,
  registerCanvasImageTextureResolver,
  registerGlShapeCommands,
  registerGlShapeRasterizer,
  registerRenderer,
  renderGlScene2D,
  ShapeKind,
  beginGlRenderPass,
  endGlRenderPass,
  createGlScreenRenderTarget,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(
  createWebGlContext(canvas, { contextAttributes: { alpha: false, preserveDrawingBuffer: true } }),
  scene3DGlPipeline,
  {
    pixelRatio,
    sceneGraphSyncPolicy: 'requiresInvalidation',
  },
);
const screenTarget = createGlScreenRenderTarget(state.gl);
enableFlightDiagnostics(state);
registerRenderer(state, ShapeKind, defaultGlShapeRenderer);
// Gradient and texture fills have no tessellated form on this backend, so they draw through an
// explicit rasterizer. It paints into no canvas of its own, so it carries a resolution set
// rather than a render state, and that set is pointed at this state's diagnostics.
const shapeRasterizerResolvers = createCanvasTextureResolvers(webCanvasRenderSurfaceCreator);
connectCanvasTextureResolverMisses(shapeRasterizerResolvers, state);
registerCanvasBitmapTextureResolver(webHostImage, shapeRasterizerResolvers);
registerCanvasImageTextureResolver(shapeRasterizerResolvers);
registerGlShapeRasterizer(state, createCanvasShapeRasterizer(shapeRasterizerResolvers));
registerGlShapeCommands(state, defaultGlShapeCommands);

export const scale = pixelRatio;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  const pass = beginGlRenderPass(state, screenTarget);
  renderGlScene2D(pass, root);
  endGlRenderPass(pass);
}
