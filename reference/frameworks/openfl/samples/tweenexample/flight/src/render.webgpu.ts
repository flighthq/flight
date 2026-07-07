import type { DisplayObject } from '@flighthq/sdk';
import {
  createWgpuCanvasElement,
  createWgpuRenderState,
  defaultWgpuBeginFill,
  defaultWgpuDrawCircle,
  defaultWgpuEndFill,
  defaultWgpuShapeRenderer,
  prepareDisplayObjectRender,
  registerDefaultWgpuMaterial,
  registerRenderer,
  registerWgpuShapeCommands,
  renderWgpuBackground,
  renderWgpuDisplayObject,
  ShapeKind,
  submitWgpuRenderPass,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(550, 400, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, {
  backgroundColor: 0xeeddccff,
  sceneGraphSyncPolicy: 'requiresInvalidation',
});
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
registerWgpuShapeCommands([defaultWgpuBeginFill, defaultWgpuEndFill, defaultWgpuDrawCircle]);
registerDefaultWgpuMaterial(state);
export const scale = pixelRatio;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderWgpuBackground(state);
  renderWgpuDisplayObject(state, root);
  submitWgpuRenderPass(state);
}
