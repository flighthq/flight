import { type BitmapFilter, filterToCSS } from '@flighthq/filters';
import type { DisplayObject } from '@flighthq/sdk';
import {
  BitmapKind,
  createCanvasElement,
  createCanvasRenderState,
  defaultCanvasBitmapRenderer,
  enableCanvasCSSFilterSupport,
  prepareDisplayObjectRender,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasDisplayObject,
  setCanvasCSSFilter,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createCanvasElement(800, 400, pixelRatio);
document.body.appendChild(canvas);

export const state = createCanvasRenderState(canvas, {
  backgroundColor: 0xffffffff,
  contextAttributes: { alpha: false },
});
registerRenderer(state, BitmapKind, defaultCanvasBitmapRenderer);
export const scale = pixelRatio;
export const width = 800;
export const height = 400;

export function applyFilters(list: { node: DisplayObject; filter: BitmapFilter }[]): void {
  enableCanvasCSSFilterSupport(state);
  for (const { node, filter } of list) {
    // filterToCSS returns null for filters with no CSS equivalent, which clears the binding.
    setCanvasCSSFilter(state, node, filterToCSS(filter));
  }
}

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderCanvasBackground(state);
  renderCanvasDisplayObject(state, root);
}
