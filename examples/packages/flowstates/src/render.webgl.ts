import {
  createWebHostTarget,
  webHostGl,
  webCanvasRenderSurfaceCreator,
  webHostImage,
  webImageSurfaceCreator,
  webSurfaceCreateCapability,
} from '@flighthq/host-web/contract';
import type { Node2D } from '@flighthq/sdk';
import {
  createGlSurface,
  scene3DGlPipeline,
  connectCanvasTextureResolverMisses,
  createCanvasTextureResolvers,
  createCanvasShapeRasterizer,
  createGlRenderState,
  defaultCanvasShapeCommands,
  defaultCanvasTextureShapeCommands,
  defaultGlShapeRenderer,
  defaultGlTextLabelRenderer,
  enableFlightDiagnostics,
  prepareScene2DRender,
  registerCanvasBitmapTextureResolver,
  registerCanvasImageTextureResolver,
  registerCanvasShapeCommands,
  registerGlShapeRasterizer,
  registerRenderer,
  renderGlScene2D,
  ShapeKind,
  TextLabelKind,
  beginGlRenderPass,
  endGlRenderPass,
  createGlScreenRenderTarget,
  createSurface,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createSurface(webSurfaceCreateCapability, 600 * pixelRatio, 400 * pixelRatio);
canvas.style.width = '600px';
canvas.style.height = '400px';
document.body.appendChild(canvas);

const target = createWebHostTarget(canvas);
const glSurface = createGlSurface(webHostGl, target, {
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
});
if (glSurface === null) throw new Error('Failed to acquire WebGL2 context');

export const state = createGlRenderState(glSurface.context, scene3DGlPipeline, {
  pixelRatio,
  sceneGraphSyncPolicy: 'requiresInvalidation',
  imageSurfaceProvider: webImageSurfaceCreator,
});
const screenTarget = createGlScreenRenderTarget(state.gl);
enableFlightDiagnostics(state);
registerRenderer(state, ShapeKind, defaultGlShapeRenderer);

// The GPU mesh lane covers solid fills and open strokes; a closed stroke, a gradient, or a texture fill
// has no tessellated form and draws through this rasterizer instead. Registering it is what keeps a
// shape from silently going missing the moment one is added.
const shapeRasterizerResolvers = createCanvasTextureResolvers(webCanvasRenderSurfaceCreator);
connectCanvasTextureResolverMisses(shapeRasterizerResolvers, state);
registerCanvasImageTextureResolver(shapeRasterizerResolvers);
registerCanvasBitmapTextureResolver(webHostImage, shapeRasterizerResolvers);
registerCanvasShapeCommands(state, defaultCanvasShapeCommands);
registerCanvasShapeCommands(state, defaultCanvasTextureShapeCommands);
registerGlShapeRasterizer(state, createCanvasShapeRasterizer(shapeRasterizerResolvers));
registerRenderer(state, TextLabelKind, defaultGlTextLabelRenderer);

export const scale = pixelRatio;

// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
const screenClear = { color: [0x22 / 0xff, 0x22 / 0xff, 0x22 / 0xff, 1] } as const;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  const pass = beginGlRenderPass(state, screenTarget, screenClear);
  renderGlScene2D(pass, root);
  endGlRenderPass(pass);
}
