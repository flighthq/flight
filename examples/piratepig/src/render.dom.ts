import type { DisplayObject } from '@flighthq/engine';
import {
  BitmapKind,
  createDOMRenderState,
  defaultCanvasShapeCommands,
  defaultDOMBitmapRenderer,
  defaultDOMShapeRenderer,
  defaultDOMTextRenderer,
  registerCanvasShapeCommands,
  registerRenderer,
  renderDOMBackground,
  renderDOMDisplayObject,
  ShapeKind,
  TextKind,
} from '@flighthq/engine';

export const container = document.createElement('div');
document.body.appendChild(container);

export const state = createDOMRenderState(container, { backgroundColor: 0x000000ff });
registerRenderer(state, BitmapKind, defaultDOMBitmapRenderer);
registerRenderer(state, ShapeKind, defaultDOMShapeRenderer);
registerRenderer(state, TextKind, defaultDOMTextRenderer);
registerCanvasShapeCommands(defaultCanvasShapeCommands);
export const scale = 1;

export function setSize(w: number, h: number): void {
  container.style.width = `${w}px`;
  container.style.height = `${h}px`;
}

export function render(root: DisplayObject): void {
  renderDOMBackground(state);
  renderDOMDisplayObject(state, root);
}
