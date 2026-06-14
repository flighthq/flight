import type { DisplayObject } from '@flighthq/sdk';
import {
  createWebGPUCanvasElement,
  createWebGPURenderState,
  defaultWebGPUTextRenderer,
  prepareDisplayObjectRender,
  registerRenderer,
  renderWebGPUBackground,
  renderWebGPUDisplayObject,
  submitWebGPURenderPass,
  TextKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWebGPUCanvasElement(400, 200, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWebGPURenderState(canvas, {
  sceneGraphSyncPolicy: 'requiresInvalidation',
  backgroundColor: 0xffffffff,
});
registerRenderer(state, TextKind, defaultWebGPUTextRenderer);
export const scale = pixelRatio;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderWebGPUBackground(state);
  renderWebGPUDisplayObject(state, root);
  submitWebGPURenderPass(state);
}
