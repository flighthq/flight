import { computeBlurFilterCSS, createBlurFilter } from '@flighthq/filters';
import type { DisplayObject } from '@flighthq/sdk';
import {
  BitmapKind,
  createDOMRenderState,
  defaultCanvasShapeCommands,
  defaultDOMBitmapRenderer,
  defaultDOMShapeRenderer,
  defaultDOMTextLabelRenderer,
  enableDOMCSSFilterSupport,
  prepareDisplayObjectRender,
  registerCanvasShapeCommands,
  registerRenderer,
  renderDOMBackground,
  renderDOMDisplayObject,
  setDOMCSSFilter,
  ShapeKind,
  TextLabelKind,
} from '@flighthq/sdk';

export const container = document.createElement('div');
document.body.appendChild(container);

export const state = createDOMRenderState(container, {
  sceneGraphSyncPolicy: 'requiresInvalidation',
  backgroundColor: 0x000000ff,
});
registerRenderer(state, BitmapKind, defaultDOMBitmapRenderer);
registerRenderer(state, ShapeKind, defaultDOMShapeRenderer);
registerRenderer(state, TextLabelKind, defaultDOMTextLabelRenderer);
registerCanvasShapeCommands(defaultCanvasShapeCommands);
enableDOMCSSFilterSupport(state);
export const scale = 1;

export function setSize(w: number, h: number): void {
  container.style.width = `${w}px`;
  container.style.height = `${h}px`;
}

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderDOMBackground(state);
  renderDOMDisplayObject(state, root);
}

// OpenFL: Background.filters = [new BlurFilter(10, 10)] — a CSS filter applied at draw. The
// returned callback is a no-op: the filter re-applies on every draw, so resizes need no re-bake.
export function applyBackgroundBlur(node: DisplayObject): () => void {
  setDOMCSSFilter(state, node, computeBlurFilterCSS(createBlurFilter({ blurX: 10, blurY: 10 })));
  return () => {};
}
