import type { DisplayObject } from '@flighthq/sdk';
import {
  createGlCanvasElement,
  createGlRenderState,
  defaultGlParticleEmitterRenderer,
  enableGlBlendModeSupport,
  ParticleEmitterKind,
  prepareDisplayObjectRender,
  registerDefaultGlMaterial,
  registerRenderer,
  renderGlBackground,
  renderGlSprite,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createGlCanvasElement(800, 400, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  backgroundColor: 0x0a0a0aff,
  sceneGraphSyncPolicy: 'requiresInvalidation',
});
registerRenderer(state, ParticleEmitterKind, defaultGlParticleEmitterRenderer);
registerDefaultGlMaterial(state);
// Opt into per-node blend modes so the emitter's additive (glow) blend takes effect.
enableGlBlendModeSupport(state);
export const scale = pixelRatio;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderGlBackground(state);
  renderGlSprite(state, root);
}
