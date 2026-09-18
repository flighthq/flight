import {
  webHostGl,
  webImageSurfaceCreator,
  appendWebSurface,
  getWebSurfaceElement,
  webHostTargetDisplay,
} from '@flighthq/host-web/contract';
import type { Node2D } from '@flighthq/sdk';
import {
  createGlSurface,
  scene3DGlPipeline,
  QuadBatchKind,
  TextLabelKind,
  createGlRenderState,
  enableFlightDiagnostics,
  defaultGlQuadBatchRenderer,
  defaultGlTextLabelRenderer,
  prepareScene2DRender,
  registerRenderer,
  renderGlScene2D,
  beginGlRenderPass,
  endGlRenderPass,
  createGlScreenRenderTarget,
  setSurfaceDisplaySize,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const glSurface = createGlSurface(webHostGl, 800 * pixelRatio, 500 * pixelRatio, {
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
});
if (glSurface === null) throw new Error('Failed to acquire WebGL2 context');
setSurfaceDisplaySize(webHostTargetDisplay, glSurface, 800, 500);
appendWebSurface(glSurface, document.body);
export const canvas = getWebSurfaceElement(glSurface)!;

export const state = createGlRenderState(glSurface.context, scene3DGlPipeline, {
  pixelRatio,
  sceneGraphSyncPolicy: 'requiresInvalidation',
  imageSurfaceProvider: webImageSurfaceCreator,
});
const screenTarget = createGlScreenRenderTarget(state.gl);
enableFlightDiagnostics(state);
registerRenderer(state, QuadBatchKind, defaultGlQuadBatchRenderer);
registerRenderer(state, TextLabelKind, defaultGlTextLabelRenderer);

export const scale = pixelRatio;

// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
const screenClear = { color: [0x2a / 0xff, 0x2a / 0xff, 0x3a / 0xff, 1] } as const;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  const pass = beginGlRenderPass(state, screenTarget, screenClear);
  renderGlScene2D(pass, root);
  endGlRenderPass(pass);
}
