import type { Node2D } from '@flighthq/sdk';
import {
  createCanvasRenderState,
  createCanvasShapeRasterizer,
  createGlCanvasElement,
  createGlRenderState,
  defaultGlShapeCommands,
  defaultGlShapeRenderer,
  enableFlightDiagnostics,
  getCanvasRenderStateTextureResolvers,
  prepareScene2DRender,
  registerCanvasBitmapTextureResolver,
  registerCanvasImageTextureResolver,
  registerGlShapeCommands,
  registerGlShapeRasterizer,
  registerGlStandardMaterial,
  registerRenderer,
  registerStandardGlTextureResolvers,
  renderGlBackground,
  renderGlScene2D,
  ShapeKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x1a1a2eff,
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
  sceneGraphSyncPolicy: 'requiresInvalidation',
});
enableFlightDiagnostics(state);

registerStandardGlTextureResolvers(state);
registerGlStandardMaterial(state);
registerRenderer(state, ShapeKind, defaultGlShapeRenderer);
// Gradient and texture fills have no tessellated form on this backend, so they draw through an
// explicit rasterizer whose CanvasRenderState carries the texture resolvers they need.
const shapeRasterizerState = createCanvasRenderState(document.createElement('canvas'));
registerCanvasBitmapTextureResolver(getCanvasRenderStateTextureResolvers(shapeRasterizerState));
registerCanvasImageTextureResolver(getCanvasRenderStateTextureResolvers(shapeRasterizerState));
registerGlShapeRasterizer(
  state,
  createCanvasShapeRasterizer(getCanvasRenderStateTextureResolvers(shapeRasterizerState)),
);
registerGlShapeCommands(defaultGlShapeCommands);

export const scale = pixelRatio;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderGlBackground(state);
  renderGlScene2D(state, root);
}
