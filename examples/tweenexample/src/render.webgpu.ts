import type { DisplayObject } from '@flighthq/sdk';
import {
  createWebGPUCanvasElement,
  createWebGPURenderState,
  defaultWebGPUBeginFill,
  defaultWebGPUDrawCircle,
  defaultWebGPUEndFill,
  defaultWebGPUShapeRenderer,
  prepareDisplayObjectRender,
  registerRenderer,
  registerWebGPUShapeCommands,
  renderWebGPUBackground,
  renderWebGPUDisplayObject,
  ShapeKind,
  submitWebGPURenderPass,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWebGPUCanvasElement(550, 400, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWebGPURenderState(canvas, {
  backgroundColor: 0xeeddccff,
  sceneGraphSyncPolicy: 'requiresInvalidation',
});
registerRenderer(state, ShapeKind, defaultWebGPUShapeRenderer);
registerWebGPUShapeCommands([defaultWebGPUBeginFill, defaultWebGPUEndFill, defaultWebGPUDrawCircle]);
export const scale = pixelRatio;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderWebGPUBackground(state);
  renderWebGPUDisplayObject(state, root);
  submitWebGPURenderPass(state);
}
