import { createWebGlContext, webImageSurfaceCreator, webSurfaceCreateCapability } from '@flighthq/host-web/contract';
import type { Node2D } from '@flighthq/sdk';
import {
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
  createSurface,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createSurface(webSurfaceCreateCapability, 800 * pixelRatio, 500 * pixelRatio);
canvas.native.style.width = '800px';
canvas.native.style.height = '500px';
document.body.appendChild(canvas.native);

export const state = createGlRenderState(
  createWebGlContext(canvas.native, { contextAttributes: { alpha: false, preserveDrawingBuffer: true } }),
  scene3DGlPipeline,
  {
    pixelRatio,
    sceneGraphSyncPolicy: 'requiresInvalidation',
    imageSurfaceProvider: webImageSurfaceCreator,
  },
);
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
