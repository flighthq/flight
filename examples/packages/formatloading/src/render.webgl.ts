import {
  webHostGl,
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
  createGlSurface,
  defaultScene3DGlRenderRegistries,
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
  setSurfaceDisplaySize,
  createAppWindow,
  openWindow,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const appWindow = createAppWindow();
openWindow(webHostWindowLifecycle, webHostWindowGeometry, appWindow, {});
const glSurface = createGlSurface(webHostGl, appWindow, 800 * pixelRatio, 600 * pixelRatio, {
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
});
if (glSurface === null) throw new Error('Failed to acquire WebGL2 context');
setSurfaceDisplaySize(webHostSurfaceDisplay, glSurface, 800, 600);
appendWebSurface(glSurface, document.body);
export const canvas = getWebSurfaceElement(glSurface)!;
document.body.style.margin = '0';

export const state = createGlRenderState(glSurface.context, defaultScene3DGlRenderRegistries, {
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
const screenClear = { color: [0x10 / 0xff, 0x18 / 0xff, 0x27 / 0xff, 1] } as const;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  const pass = beginGlRenderPass(state, screenTarget, screenClear);
  renderGlScene2D(pass, root);
  endGlRenderPass(pass);
}
