import type { SpriteNode } from '@flighthq/sdk';
import {
  createWebGLElement,
  createWebGLRenderState,
  defaultWebGLParticleEmitterRenderer,
  ParticleEmitterKind,
  prepareSpriteRender,
  registerRenderer,
  renderWebGLBackground,
  renderWebGLSprite,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createWebGLElement(800, 400, pixelRatio);
document.body.appendChild(canvas);

export const state = createWebGLRenderState(canvas, {
  backgroundColor: 0x0a0a0aff,
  sceneGraphSyncPolicy: 'requiresInvalidation',
});
registerRenderer(state, ParticleEmitterKind, defaultWebGLParticleEmitterRenderer);

export const scale = pixelRatio;

export function render(root: SpriteNode): void {
  if (!prepareSpriteRender(state, root)) return;
  renderWebGLBackground(state);
  renderWebGLSprite(state, root);
}
