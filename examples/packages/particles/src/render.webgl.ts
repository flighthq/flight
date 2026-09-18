import {
  webHostGl,
  webImageSurfaceCreator,
  appendWebSurface,
  getWebSurfaceElement,
  setWebSurfaceDisplaySize,
} from '@flighthq/host-web/contract';
import type { Node2D } from '@flighthq/sdk';
import {
  createGlSurface,
  scene3DGlPipeline,
  createGlRenderState,
  enableFlightDiagnostics,
  defaultGlParticleEmitter2DRenderer,
  defaultGlTextLabelRenderer,
  enableGlBlendModeSupport,
  ParticleEmitter2DKind,
  prepareScene2DRender,
  registerRenderer,
  renderGlScene2D,
  TextLabelKind,
  beginGlRenderPass,
  endGlRenderPass,
  createGlScreenRenderTarget,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const glSurface = createGlSurface(webHostGl, 800 * pixelRatio, 500 * pixelRatio, {
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
});
if (glSurface === null) throw new Error('Failed to acquire WebGL2 context');
setWebSurfaceDisplaySize(glSurface, 800, 500);
appendWebSurface(glSurface, document.body);
export const canvas = getWebSurfaceElement(glSurface)!;

export const state = createGlRenderState(glSurface.context, scene3DGlPipeline, {
  pixelRatio,
  sceneGraphSyncPolicy: 'requiresInvalidation',
  imageSurfaceProvider: webImageSurfaceCreator,
});
const screenTarget = createGlScreenRenderTarget(state.gl);
enableFlightDiagnostics(state);
registerRenderer(state, ParticleEmitter2DKind, defaultGlParticleEmitter2DRenderer);
registerRenderer(state, TextLabelKind, defaultGlTextLabelRenderer);
enableGlBlendModeSupport(state);

export const scale = pixelRatio;

// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
const screenClear = { color: [0x0a / 0xff, 0x0a / 0xff, 0x14 / 0xff, 1] } as const;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  const pass = beginGlRenderPass(state, screenTarget, screenClear);
  renderGlScene2D(pass, root);
  endGlRenderPass(pass);
}
