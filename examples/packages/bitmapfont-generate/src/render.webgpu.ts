import type { DisplayObject } from '@flighthq/sdk';
import {
  BitmapKind,
  createWgpuCanvasElement,
  createWgpuRenderState,
  defaultWgpuBitmapRenderer,
  defaultWgpuQuadBatchRenderer,
  prepareDisplayObjectRender,
  QuadBatchKind,
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
  backgroundColor: 0x111827ff,
  sceneGraphSyncPolicy: 'requiresInvalidation',
});

registerDefaultWgpuMaterial(state);
registerRenderer(state, BitmapKind, defaultWgpuBitmapRenderer);
registerRenderer(state, QuadBatchKind, defaultWgpuQuadBatchRenderer);

export const scale = pixelRatio;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderWgpuBackground(state);
  renderWgpuDisplayObject(state, root);
  submitWgpuRenderPass(state);
}
