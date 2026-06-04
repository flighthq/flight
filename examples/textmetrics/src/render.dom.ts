import type { DisplayObject } from '@flighthq/sdk';
import {
  createDOMRenderState,
  defaultCanvasShapeCommands,
  defaultDOMRichTextRenderer,
  defaultDOMShapeRenderer,
  prepareDOMDisplayObjectRender,
  registerCanvasShapeCommands,
  registerRenderer,
  renderDOM,
  renderDOMBackground,
  RichTextKind,
  ShapeKind,
} from '@flighthq/sdk';

const element = document.createElement('div');
element.style.position = 'relative';
element.style.width = `${window.innerWidth}px`;
element.style.height = `${window.innerHeight}px`;
document.body.style.margin = '0';
document.body.appendChild(element);

export const container = element;
export const state = createDOMRenderState(element, { backgroundColor: 0xa0a0a0ff });
registerRenderer(state, RichTextKind, defaultDOMRichTextRenderer);
registerRenderer(state, ShapeKind, defaultDOMShapeRenderer);
registerCanvasShapeCommands(defaultCanvasShapeCommands);
export const scale = 1;

export function render(root: DisplayObject): void {
  if (!prepareDOMDisplayObjectRender(state, root)) return;
  renderDOMBackground(state);
  renderDOM(state);
}

export function setSize(w: number, h: number): void {
  element.style.width = `${w}px`;
  element.style.height = `${h}px`;
}
