import {
  webHostGl,
  appendWebSurface,
  getWebSurfaceElement,
  webHostSurfaceDisplay,
  webHostWindowGeometry,
  webHostWindowLifecycle,
} from '@flighthq/host-web/contract';
import type { Node2D } from '@flighthq/sdk';
import {
  createGlSurface,
  glScene3DRenderRegistries,
  SpriteKind,
  TilemapKind,
  createGlRenderState,
  enableFlightDiagnostics,
  glSpriteRenderer,
  glTilemapRenderer,
  prepareScene2DRender,
  registerNodeRenderer,
  renderGlScene2D,
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

export const state = createGlRenderState(glSurface.context, glScene3DRenderRegistries, {
  pixelRatio,
  sceneGraphSyncPolicy: 'requiresInvalidation',
});
const screenTarget = createGlScreenRenderTarget(state.gl);
enableFlightDiagnostics(state);
registerNodeRenderer(state, SpriteKind, glSpriteRenderer);
registerNodeRenderer(state, TilemapKind, glTilemapRenderer);

export const scale = pixelRatio;

// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
const screenClear = { color: [0x1a / 0xff, 0x1a / 0xff, 0x2e / 0xff, 1] } as const;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  const pass = beginGlRenderPass(state, screenTarget, screenClear);
  renderGlScene2D(pass, root);
  endGlRenderPass(pass);
}
