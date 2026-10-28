import {
  webHostGl,
  webHostCanvas,
  webHostImage,
  appendWebSurface,
  getWebSurfaceElement,
  webHostSurfaceDisplay,
  webHostWindowGeometry,
  webHostWindowLifecycle,
} from '@flighthq/host-web/contract';
import type { Node2D, LogState } from '@flighthq/sdk';
import {
  createGlSurface,
  glScene3DRenderPreset,
  connectCanvasTextureResolverMisses,
  createCanvasTextureResolvers,
  createCanvasShapeRasterizer,
  createGlRenderState,
  canvasShapeCommands,
  glShapeRenderer,
  enableFlightDiagnostics,
  prepareScene2DRender,
  registerCanvasBitmapTextureResolver,
  registerCanvasImageTextureResolver,
  registerCanvasShapeCommands,
  registerGlShapeRasterizer,
  registerNodeRenderer,
  renderGlScene2D,
  ShapeKind,
  beginGlRenderPass,
  endGlRenderPass,
  createGlScreenRenderTarget,
  setSurfaceDisplaySize,
  createAppWindow,
  openWindow,
  createLogState,
  createDebugState,
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

export const state = createGlRenderState(glSurface.context, {
  ...glScene3DRenderPreset,
  pixelRatio,
  sceneGraphSyncPolicy: 'requiresInvalidation',
});
const screenTarget = createGlScreenRenderTarget(state.gl);
// The runner publishes the page's LogState; a standalone build logs into a private one.
const logState = (window as { __flightLogState?: LogState }).__flightLogState ?? createLogState();
enableFlightDiagnostics(createDebugState(), logState, state);
registerNodeRenderer(state, ShapeKind, glShapeRenderer);
// Gradient and texture fills have no tessellated form on this backend, so they draw through an
// explicit rasterizer. It paints into no canvas of its own, so it carries a resolution set
// rather than a render state, and that set is pointed at this state's diagnostics.
const shapeRasterizerResolvers = createCanvasTextureResolvers(webHostCanvas);
connectCanvasTextureResolverMisses(shapeRasterizerResolvers, state);
registerCanvasBitmapTextureResolver(webHostImage, shapeRasterizerResolvers);
registerCanvasImageTextureResolver(shapeRasterizerResolvers);
registerGlShapeRasterizer(state, createCanvasShapeRasterizer(shapeRasterizerResolvers));
registerCanvasShapeCommands(state, canvasShapeCommands);

export const scale = pixelRatio;

// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
const screenClear = { color: [0x1a / 0xff, 0x1a / 0xff, 0x2e / 0xff, 1] } as const;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  const pass = beginGlRenderPass(state, screenTarget, screenClear);
  renderGlScene2D(pass, root);
  endGlRenderPass(pass);
}
