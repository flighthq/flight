import type { DisplayObject } from '@flighthq/sdk';
import {
  createGlCanvasElement,
  createGlRenderState,
  defaultGlParticleEmitter2DRenderer,
  defaultGlTextLabelRenderer,
  enableGlBlendModeSupport,
  ParticleEmitter2DKind,
  prepareDisplayObjectRender,
  registerDefaultGlMaterial,
  registerRenderer,
  renderGlBackground,
  renderGlDisplayObject,
  TextLabelKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createGlCanvasElement(800, 500, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x0a0a14ff,
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
  sceneGraphSyncPolicy: 'requiresInvalidation',
});

registerDefaultGlMaterial(state);
registerRenderer(state, ParticleEmitter2DKind, defaultGlParticleEmitter2DRenderer);
registerRenderer(state, TextLabelKind, defaultGlTextLabelRenderer);
enableGlBlendModeSupport(state);

export const scale = pixelRatio;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderGlBackground(state);
  renderGlDisplayObject(state, root);
}
