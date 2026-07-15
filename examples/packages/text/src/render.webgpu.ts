import type { DisplayObject } from '@flighthq/sdk';
import {
  createWgpuCanvasElement,
  createWgpuRenderState,
  defaultWgpuRichTextRenderer,
  defaultWgpuShapeCommands,
  defaultWgpuShapeRenderer,
  defaultWgpuTextLabelRenderer,
  prepareDisplayObjectRender,
  registerDefaultWgpuMaterial,
  registerWgpuShapeCommands,
  registerRenderer,
  renderWgpuBackground,
  renderWgpuDisplayObject,
  RichTextKind,
  ShapeKind,
  TextLabelKind,
  submitWgpuRenderPass,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0xffffffff,
  sceneGraphSyncPolicy: 'requiresInvalidation',
});

registerDefaultWgpuMaterial(state);
registerRenderer(state, RichTextKind, defaultWgpuRichTextRenderer);
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
