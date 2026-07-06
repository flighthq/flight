import type { DisplayObject } from '@flighthq/sdk';
import {
  createWgpuCanvasElement,
  createWgpuRenderState,
  defaultWgpuBeginFill,
  defaultWgpuCurveTo,
  defaultWgpuDrawCircle,
  defaultWgpuDrawEllipse,
  defaultWgpuDrawRectangle,
  defaultWgpuDrawRoundRectangle,
  defaultWgpuLineStyle,
  defaultWgpuLineTo,
  defaultWgpuMoveTo,
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
const canvas = createWgpuCanvasElement(800, 400, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, {
  backgroundColor: 0xffffffff,
  sceneGraphSyncPolicy: 'requiresInvalidation',
});
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
registerWgpuShapeCommands([
  defaultWgpuBeginFill,
  defaultWgpuCurveTo,
  defaultWgpuDrawCircle,
  defaultWgpuDrawEllipse,
  defaultWgpuDrawRectangle,
  defaultWgpuDrawRoundRectangle,
  defaultWgpuLineStyle,
  defaultWgpuLineTo,
  defaultWgpuMoveTo,
]);
registerDefaultWgpuMaterial(state);
export const scale = pixelRatio;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderWgpuBackground(state);
  renderWgpuDisplayObject(state, root);
  submitWgpuRenderPass(state);
}
