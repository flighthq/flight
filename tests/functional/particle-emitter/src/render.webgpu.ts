import type { DisplayObject } from '@flighthq/sdk';
import {
  createWgpuCanvasElement,
  createWgpuRenderState,
  defaultWgpuParticleEmitterRenderer,
  defaultWgpuSpriteRenderer,
  ParticleEmitterKind,
  prepareDisplayObjectRender,
  registerDefaultWgpuMaterial,
  registerRenderer,
  renderWgpuBackground,
  renderWgpuSprite,
  SpriteKind,
  submitWgpuRenderPass,
} from '@flighthq/sdk';

import { registerWgpuFunctionalTarget } from '../../_harness/verify';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createWgpuCanvasElement(800, 450, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x111111ff,
  sceneGraphSyncPolicy: 'requiresInvalidation',
});
registerRenderer(state, ParticleEmitterKind, defaultWgpuParticleEmitterRenderer);
registerRenderer(state, SpriteKind, defaultWgpuSpriteRenderer);

registerDefaultWgpuMaterial(state);
export const scale = pixelRatio;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderWgpuBackground(state);
  renderWgpuSprite(state, root);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);
