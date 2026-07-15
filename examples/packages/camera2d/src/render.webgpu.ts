import type { DisplayObject } from '@flighthq/sdk';
import {
  ShapeKind,
  TextLabelKind,
  createWgpuCanvasElement,
  createWgpuRenderState,
  defaultWgpuShapeCommands,
  defaultWgpuShapeRenderer,
  defaultWgpuTextLabelRenderer,
  prepareDisplayObjectRender,
  registerDefaultWgpuMaterial,
  registerWgpuShapeCommands,
  registerRenderer,
  renderWgpuBackground,
  renderWgpuDisplayObject,
  submitWgpuRenderPass,
} from '@flighthq/sdk';

export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;

const pixelRatio = window.devicePixelRatio || 1;

export const canvas = createWgpuCanvasElement(CANVAS_WIDTH, CANVAS_HEIGHT, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x1a1a2eff,
  sceneGraphSyncPolicy: 'requiresInvalidation',
});

registerDefaultWgpuMaterial(state);
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
registerRenderer(state, TextLabelKind, defaultWgpuTextLabelRenderer);
registerWgpuShapeCommands(defaultWgpuShapeCommands);

export const scale = pixelRatio;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderWgpuBackground(state);
  renderWgpuDisplayObject(state, root);
  submitWgpuRenderPass(state);
}
