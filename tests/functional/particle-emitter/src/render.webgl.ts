import type { SpriteNode } from '@flighthq/sdk';
import {
  createWebGLCanvasElement,
  createWebGLRenderState,
  defaultWebGLParticleEmitterRenderer,
  defaultWebGLSpriteRenderer,
  ParticleEmitterKind,
  prepareSpriteRender,
  registerRenderer,
  renderWebGLBackground,
  renderWebGLSprite,
  SpriteKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createWebGLCanvasElement(800, 450, pixelRatio);
document.body.appendChild(canvas);

export const state = createWebGLRenderState(canvas, {
  backgroundColor: 0x111111ff,
  sceneGraphSyncPolicy: 'requiresInvalidation',
});
registerRenderer(state, ParticleEmitterKind, defaultWebGLParticleEmitterRenderer);
registerRenderer(state, SpriteKind, defaultWebGLSpriteRenderer);

export const scale = pixelRatio;

export function render(root: SpriteNode): void {
  if (!prepareSpriteRender(state, root)) return;
  renderWebGLBackground(state);
  renderWebGLSprite(state, root);
}
