import type { Sprite } from '@flighthq/sdk';
import {
  createWebGPUCanvasElement,
  createWebGPURenderState,
  defaultWebGPUSpriteRenderer,
  prepareSpriteRender,
  registerDefaultWebGPUMaterial,
  registerRenderer,
  renderWebGPUBackground,
  renderWebGPUSprite,
  SpriteKind,
  submitWebGPURenderPass,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWebGPUCanvasElement(256, 256, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWebGPURenderState(canvas, {
  sceneGraphSyncPolicy: 'requiresInvalidation',
  backgroundColor: 0xeeddccff,
  imageSmoothingEnabled: false,
});
registerRenderer(state, SpriteKind, defaultWebGPUSpriteRenderer);
registerDefaultWebGPUMaterial(state);
export const scale = pixelRatio;

export function render(root: Sprite): void {
  if (!prepareSpriteRender(state, root)) return;
  renderWebGPUBackground(state);
  renderWebGPUSprite(state, root);
  submitWebGPURenderPass(state);
}
