import type { SpriteNode } from '@flighthq/sdk';
import {
  createWebGLCanvasElement,
  createWebGLRenderState,
  defaultWebGLParticleEmitterRenderer,
  ParticleEmitterKind,
  prepareSpriteRender,
  registerDefaultWebGLMaterial,
  registerRenderer,
  renderWebGLBackground,
  renderWebGLSprite,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createWebGLCanvasElement(800, 400, pixelRatio);
document.body.appendChild(canvas);

export const state = createWebGLRenderState(canvas, {
  backgroundColor: 0x0a0a0aff,
  sceneGraphSyncPolicy: 'requiresInvalidation',
});
registerRenderer(state, ParticleEmitterKind, defaultWebGLParticleEmitterRenderer);
registerDefaultWebGLMaterial(state);
export const scale = pixelRatio;

export function render(root: SpriteNode): void {
  if (!prepareSpriteRender(state, root)) return;
  renderWebGLBackground(state);
  renderWebGLSprite(state, root);
}
