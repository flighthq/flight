import type { Sprite } from '@flighthq/sdk';
import {
  createGlCanvasElement,
  createGlRenderState,
  defaultGlSpriteRenderer,
  prepareDisplayObjectRender,
  registerDefaultGlMaterial,
  registerRenderer,
  renderGlBackground,
  renderGlSprite,
  SpriteKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createGlCanvasElement(800, 400, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  sceneGraphSyncPolicy: 'requiresInvalidation',
  backgroundColor: 0xeeddccff,
  imageSmoothingEnabled: false,
});
registerRenderer(state, SpriteKind, defaultGlSpriteRenderer);
registerDefaultGlMaterial(state);
export const scale = pixelRatio;

export function render(root: Sprite): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderGlBackground(state);
  renderGlSprite(state, root);
}
