import type { DisplayObject } from '@flighthq/sdk';
import {
  createDOMRenderState,
  defaultCanvasShapeCommands,
  defaultDOMShapeRenderer,
  registerCanvasShapeCommands,
  registerRenderer,
  renderDOMBackground,
  renderDOMDisplayObject,
  ShapeKind,
} from '@flighthq/sdk';

const element = document.createElement('div');
element.style.position = 'relative';
element.style.width = `${window.innerWidth}px`;
element.style.height = `${window.innerHeight}px`;
document.body.appendChild(element);

export const container = element;
export const state = createDOMRenderState(element, { backgroundColor: 0xffffffff });
registerRenderer(state, ShapeKind, defaultDOMShapeRenderer);
registerCanvasShapeCommands(defaultCanvasShapeCommands);
export const scale = 1;

export function render(root: DisplayObject): void {
  renderDOMBackground(state);
  renderDOMDisplayObject(state, root);
}

export function setSize(w: number, h: number): void {
  element.style.width = `${w}px`;
  element.style.height = `${h}px`;
}
