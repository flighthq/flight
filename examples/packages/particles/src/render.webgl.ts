import type { Node2D } from '@flighthq/sdk';
import {
  createGlContextFromCanvasElement,
  createGlCanvasElement,
  createGlRenderState,
  enableFlightDiagnostics,
  defaultGlParticleEmitter2DRenderer,
  defaultGlTextLabelRenderer,
  enableGlBlendModeSupport,
  ParticleEmitter2DKind,
  prepareScene2DRender,
  registerStandardGlTextureResolvers,
  registerGlStandardMaterial,
  registerRenderer,
  renderGlBackground,
  renderGlScene2D,
  TextLabelKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createGlCanvasElement(800, 500, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(
  createGlContextFromCanvasElement(canvas, { contextAttributes: { alpha: false, preserveDrawingBuffer: true } }),
  {
    pixelRatio,
    backgroundColor: 0x0a0a14ff,
    sceneGraphSyncPolicy: 'requiresInvalidation',
  },
);
enableFlightDiagnostics(state);

registerStandardGlTextureResolvers(state);
registerGlStandardMaterial(state);
registerRenderer(state, ParticleEmitter2DKind, defaultGlParticleEmitter2DRenderer);
registerRenderer(state, TextLabelKind, defaultGlTextLabelRenderer);
enableGlBlendModeSupport(state);

export const scale = pixelRatio;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderGlBackground(state);
  renderGlScene2D(state, root);
}
