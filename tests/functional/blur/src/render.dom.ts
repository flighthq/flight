import { type BlurFilter, computeBlurFilterCSS } from '@flighthq/filters';
import type { DisplayObject } from '@flighthq/sdk';
import {
  BitmapKind,
  createDOMRenderState,
  defaultDOMBitmapRenderer,
  defaultDOMRichTextRenderer,
  enableDOMCSSFilterSupport,
  prepareDisplayObjectRender,
  registerRenderer,
  renderDOMBackground,
  renderDOMDisplayObject,
  RichTextKind,
  setDOMCSSFilter,
} from '@flighthq/sdk';

const container = document.createElement('div');
container.style.position = 'relative';
container.style.width = '800px';
container.style.height = '400px';
document.body.appendChild(container);

export const state = createDOMRenderState(container, { backgroundColor: 0xffffffff });
registerRenderer(state, BitmapKind, defaultDOMBitmapRenderer);
registerRenderer(state, RichTextKind, defaultDOMRichTextRenderer);
export const scale = 1;
export const width = 800;
export const height = 400;

export function applyBlurFilters(list: { node: DisplayObject; filter: BlurFilter }[]): void {
  enableDOMCSSFilterSupport(state);
  for (const { node, filter } of list) {
    // computeBlurFilterCSS returns null for anisotropic blur (blurX !== blurY), which clears the binding.
    setDOMCSSFilter(state, node, computeBlurFilterCSS(filter));
  }
}

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderDOMBackground(state);
  renderDOMDisplayObject(state, root);
}
