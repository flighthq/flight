import type { DisplayObject } from '@flighthq/sdk';
import {
  BitmapKind,
  createDOMRenderState,
  defaultDOMBitmapRenderer,
  defaultDOMRichTextRenderer,
  defaultDOMShapeRenderer,
  enableDOMBlendModeSupport,
  prepareDisplayObjectRender,
  registerRenderer,
  renderDOMBackground,
  renderDOMDisplayObject,
  RichTextKind,
  ShapeKind,
} from '@flighthq/sdk';

const container = document.createElement('div');
container.style.position = 'relative';
container.style.width = '1100px';
container.style.height = '700px';
document.body.appendChild(container);

export const state = createDOMRenderState(container, { backgroundColor: 0xffffffff });
enableDOMBlendModeSupport(state);
registerRenderer(state, ShapeKind, defaultDOMShapeRenderer);
registerRenderer(state, BitmapKind, defaultDOMBitmapRenderer);
registerRenderer(state, RichTextKind, defaultDOMRichTextRenderer);
export const scale = 1;
export const width = 1100;
export const height = 700;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderDOMBackground(state);
  renderDOMDisplayObject(state, root);
}
