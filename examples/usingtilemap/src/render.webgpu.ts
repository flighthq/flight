import type { Tilemap } from '@flighthq/sdk';
import {
  createWebGPUCanvasElement,
  createWebGPURenderState,
  defaultWebGPUTilemapRenderer,
  prepareDisplayObjectRender,
  registerDefaultWebGPUMaterial,
  registerRenderer,
  renderWebGPUBackground,
  renderWebGPUSprite,
  submitWebGPURenderPass,
  TilemapKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWebGPUCanvasElement(592, 592, pixelRatio);
document.getElementById('app')!.appendChild(canvas);

export const state = await createWebGPURenderState(canvas, {
  backgroundColor: 0xeeddccff,
  imageSmoothingEnabled: false,
  sceneGraphSyncPolicy: 'requiresInvalidation',
});
registerRenderer(state, TilemapKind, defaultWebGPUTilemapRenderer);
registerDefaultWebGPUMaterial(state);
export const scale = pixelRatio;

export function render(root: Tilemap): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderWebGPUBackground(state);
  renderWebGPUSprite(state, root);
  submitWebGPURenderPass(state);
}
