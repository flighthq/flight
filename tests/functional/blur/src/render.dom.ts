import { type BitmapFilter, filterToCSS } from '@flighthq/filters';
import type { DisplayObject } from '@flighthq/sdk';
import {
  BitmapKind,
  createDOMRenderState,
  defaultDOMBitmapRenderer,
  enableDOMCSSFilterSupport,
  prepareDisplayObjectRender,
  registerRenderer,
  renderDOMBackground,
  renderDOMDisplayObject,
  setDOMCSSFilter,
} from '@flighthq/sdk';

const container = document.createElement('div');
container.style.position = 'relative';
container.style.width = '800px';
container.style.height = '400px';
document.body.appendChild(container);

export const state = createDOMRenderState(container, { backgroundColor: 0xffffffff });
registerRenderer(state, BitmapKind, defaultDOMBitmapRenderer);
export const scale = 1;
export const width = 800;
export const height = 400;

export function applyFilters(list: { node: DisplayObject; filter: BitmapFilter }[]): void {
  enableDOMCSSFilterSupport(state);
  for (const { node, filter } of list) {
    // filterToCSS returns null for filters with no CSS equivalent, which clears the binding.
    setDOMCSSFilter(state, node, filterToCSS(filter));
  }
}

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderDOMBackground(state);
  renderDOMDisplayObject(state, root);
}
