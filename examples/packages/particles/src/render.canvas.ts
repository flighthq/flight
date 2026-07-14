import type { DisplayObject } from '@flighthq/sdk';
import {
  createCanvasElement,
  createCanvasRenderState,
  defaultCanvasParticleEmitterRenderer,
  defaultCanvasTextLabelRenderer,
  enableCanvasBlendMode,
  ParticleEmitterKind,
  prepareDisplayObjectRender,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasDisplayObject,
  TextLabelKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createCanvasElement(800, 500, pixelRatio);
document.body.appendChild(canvas);

export const state = createCanvasRenderState(canvas, {
  sceneGraphSyncPolicy: 'requiresInvalidation',
  backgroundColor: 0x0a0a14ff,
});

registerRenderer(state, ParticleEmitterKind, defaultCanvasParticleEmitterRenderer);
registerRenderer(state, TextLabelKind, defaultCanvasTextLabelRenderer);
enableCanvasBlendMode(state);

export const scale = pixelRatio;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderCanvasBackground(state);
  renderCanvasDisplayObject(state, root);
}
