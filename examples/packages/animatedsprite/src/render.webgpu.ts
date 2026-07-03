import type { Sprite } from '@flighthq/sdk';
import {
  createWgpuCanvasElement,
  createWgpuRenderState,
  defaultWgpuSpriteRenderer,
  prepareDisplayObjectRender,
  registerDefaultWgpuMaterial,
  registerRenderer,
  renderWgpuBackground,
  renderWgpuSprite,
  SpriteKind,
  submitWgpuRenderPass,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 400, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, {
  sceneGraphSyncPolicy: 'requiresInvalidation',
  backgroundColor: 0xeeddccff,
  imageSmoothingEnabled: false,
});
registerRenderer(state, SpriteKind, defaultWgpuSpriteRenderer);
registerDefaultWgpuMaterial(state);
export const scale = pixelRatio;

export function render(root: Sprite): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderWgpuBackground(state);
  renderWgpuSprite(state, root);
  submitWgpuRenderPass(state);
}
