import type { DisplayObject } from '@flighthq/sdk';
import {
  BitmapKind,
  TilemapKind,
  createWgpuCanvasElement,
  createWgpuRenderState,
  defaultWgpuBitmapRenderer,
  defaultWgpuTilemapRenderer,
  prepareDisplayObjectRender,
  registerDefaultWgpuMaterial,
  registerRenderer,
  renderWgpuBackground,
  renderWgpuDisplayObject,
  submitWgpuRenderPass,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x1a1a2eff,
  sceneGraphSyncPolicy: 'requiresInvalidation',
});

registerDefaultWgpuMaterial(state);
registerRenderer(state, BitmapKind, defaultWgpuBitmapRenderer);
registerRenderer(state, TilemapKind, defaultWgpuTilemapRenderer);

export const scale = pixelRatio;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderWgpuBackground(state);
  renderWgpuDisplayObject(state, root);
  submitWgpuRenderPass(state);
}
