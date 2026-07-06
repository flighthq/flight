import { createBlurFilter } from '@flighthq/filters';
import { computeBlurFilterCss } from '@flighthq/filters-css';
import type { DisplayObject } from '@flighthq/sdk';
import {
  BitmapKind,
  createDomRenderState,
  defaultCanvasBeginFill,
  defaultCanvasDrawRectangle,
  defaultCanvasEndFill,
  defaultDomBitmapRenderer,
  defaultDomShapeRenderer,
  defaultDomTextLabelRenderer,
  enableDomCssFilterSupport,
  prepareDisplayObjectRender,
  registerCanvasShapeCommands,
  registerRenderer,
  renderDomBackground,
  renderDomDisplayObject,
  setDomCssFilter,
  ShapeKind,
  TextLabelKind,
} from '@flighthq/sdk';

export const container = document.createElement('div');
document.body.appendChild(container);

export const state = createDomRenderState(container, {
  sceneGraphSyncPolicy: 'requiresInvalidation',
  backgroundColor: 0x000000ff,
});
registerRenderer(state, BitmapKind, defaultDomBitmapRenderer);
registerRenderer(state, ShapeKind, defaultDomShapeRenderer);
registerRenderer(state, TextLabelKind, defaultDomTextLabelRenderer);
registerCanvasShapeCommands([defaultCanvasBeginFill, defaultCanvasDrawRectangle, defaultCanvasEndFill]);
enableDomCssFilterSupport(state);
export const scale = 1;

export function setSize(w: number, h: number): void {
  container.style.width = `${w}px`;
  container.style.height = `${h}px`;
}

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderDomBackground(state);
  renderDomDisplayObject(state, root);
}

// OpenFL: Background.filters = [new BlurFilter(10, 10)] — a CSS filter applied at draw. The
// returned callback is a no-op: the filter re-applies on every draw, so resizes need no re-bake.
export function applyBackgroundBlur(node: DisplayObject): () => void {
  setDomCssFilter(state, node, computeBlurFilterCss(createBlurFilter({ blurX: 10, blurY: 10 })));
  return () => {};
}
