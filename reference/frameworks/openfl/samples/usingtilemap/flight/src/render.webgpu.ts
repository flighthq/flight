import type { Tilemap } from '@flighthq/sdk';
import {
  createWgpuCanvasElement,
  createWgpuRenderState,
  defaultWgpuTilemapRenderer,
  prepareDisplayObjectRender,
  registerDefaultWgpuMaterial,
  registerRenderer,
  renderWgpuBackground,
  renderWgpuSprite,
  submitWgpuRenderPass,
  TilemapKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(592, 592, pixelRatio);
document.getElementById('app')!.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, {
  backgroundColor: 0xeeddccff,
  imageSmoothingEnabled: false,
  sceneGraphSyncPolicy: 'requiresInvalidation',
});
registerRenderer(state, TilemapKind, defaultWgpuTilemapRenderer);
registerDefaultWgpuMaterial(state);
export const scale = pixelRatio;

export function render(root: Tilemap): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderWgpuBackground(state);
  renderWgpuSprite(state, root);
  submitWgpuRenderPass(state);
}
