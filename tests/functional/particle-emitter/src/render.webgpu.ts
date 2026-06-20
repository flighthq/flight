import type { DisplayObject } from '@flighthq/sdk';
import {
  createWebGPUCanvasElement,
  createWebGPURenderState,
  defaultWebGPUParticleEmitterRenderer,
  defaultWebGPUSpriteRenderer,
  ParticleEmitterKind,
  prepareDisplayObjectRender,
  registerDefaultWebGPUMaterial,
  registerRenderer,
  renderWebGPUBackground,
  renderWebGPUSprite,
  SpriteKind,
  submitWebGPURenderPass,
} from '@flighthq/sdk';

import { registerWebGPUFunctionalTarget } from '../../_harness/verify';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createWebGPUCanvasElement(800, 450, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWebGPURenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x111111ff,
  sceneGraphSyncPolicy: 'requiresInvalidation',
});
registerRenderer(state, ParticleEmitterKind, defaultWebGPUParticleEmitterRenderer);
registerRenderer(state, SpriteKind, defaultWebGPUSpriteRenderer);

registerDefaultWebGPUMaterial(state);
export const scale = pixelRatio;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderWebGPUBackground(state);
  renderWebGPUSprite(state, root);
  submitWebGPURenderPass(state);
}

registerWebGPUFunctionalTarget(state, scale);
