import type { DisplayObject } from '@flighthq/sdk';
import {
  createCanvasElement,
  createCanvasRenderState,
  defaultCanvasBeginFill,
  defaultCanvasDrawCircle,
  defaultCanvasEndFill,
  defaultCanvasShapeRenderer,
  prepareCanvasDisplayObjectRender,
  registerCanvasShapeCommands,
  registerRenderer,
  renderCanvas,
  renderCanvasBackground,
  ShapeKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createCanvasElement(550, 400, pixelRatio);
document.body.appendChild(canvas);

export const state = createCanvasRenderState(canvas, {
  backgroundColor: 0xeeddccff,
  contextAttributes: { alpha: false },
});
registerRenderer(state, ShapeKind, defaultCanvasShapeRenderer);
registerCanvasShapeCommands([defaultCanvasBeginFill, defaultCanvasEndFill, defaultCanvasDrawCircle]);
export const scale = pixelRatio;

export function render(root: DisplayObject): void {
  if (!prepareCanvasDisplayObjectRender(state, root)) return;
  renderCanvasBackground(state);
  renderCanvas(state);
}
