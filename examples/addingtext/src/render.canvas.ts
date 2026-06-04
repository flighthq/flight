import type { DisplayObject } from '@flighthq/sdk';
import {
  createCanvasElement,
  createCanvasRenderState,
  defaultCanvasTextRenderer,
  prepareCanvasDisplayObjectRender,
  registerRenderer,
  renderCanvas,
  renderCanvasBackground,
  TextKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createCanvasElement(400, 200, pixelRatio);
document.body.appendChild(canvas);

export const state = createCanvasRenderState(canvas, {
  backgroundColor: 0xffffffff,
  contextAttributes: { alpha: false },
});
registerRenderer(state, TextKind, defaultCanvasTextRenderer);
export const scale = pixelRatio;

export function render(root: DisplayObject): void {
  if (!prepareCanvasDisplayObjectRender(state, root)) return;
  renderCanvasBackground(state);
  renderCanvas(state);
}
