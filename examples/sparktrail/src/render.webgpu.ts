import type { SpriteNode } from '@flighthq/sdk';
import {
  createWebGPUCanvasElement,
  createWebGPURenderState,
  defaultWebGPUParticleEmitterRenderer,
  ParticleEmitterKind,
  prepareSpriteRender,
  registerRenderer,
  renderWebGPUBackground,
  renderWebGPUSprite,
  submitWebGPURenderPass,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createWebGPUCanvasElement(800, 400, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWebGPURenderState(canvas, {
  backgroundColor: 0x0a0a0aff,
  sceneGraphSyncPolicy: 'requiresInvalidation',
});
registerRenderer(state, ParticleEmitterKind, defaultWebGPUParticleEmitterRenderer);

export const scale = pixelRatio;

export function render(root: SpriteNode): void {
  if (!prepareSpriteRender(state, root)) return;
  renderWebGPUBackground(state);
  renderWebGPUSprite(state, root);
  submitWebGPURenderPass(state);
}
