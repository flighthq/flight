import type { DisplayObject } from '@flighthq/sdk';
import {
  createWgpuCanvasElement,
  createWgpuRenderState,
  defaultWgpuParticleEmitterRenderer,
  enableWgpuBlendModeSupport,
  ParticleEmitterKind,
  prepareDisplayObjectRender,
  registerDefaultWgpuMaterial,
  registerRenderer,
  renderWgpuBackground,
  renderWgpuSprite,
  submitWgpuRenderPass,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createWgpuCanvasElement(800, 400, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, {
  backgroundColor: 0x0a0a0aff,
  sceneGraphSyncPolicy: 'requiresInvalidation',
});
registerRenderer(state, ParticleEmitterKind, defaultWgpuParticleEmitterRenderer);
registerDefaultWgpuMaterial(state);
// Opt into per-node blend modes so the emitter's additive (glow) blend takes effect.
enableWgpuBlendModeSupport(state);
export const scale = pixelRatio;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderWgpuBackground(state);
  renderWgpuSprite(state, root);
  submitWgpuRenderPass(state);
}
