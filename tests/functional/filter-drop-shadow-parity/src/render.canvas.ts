// Canvas backend of the drop-shadow-parity test.
//
// Native path: the canvas renderer applies a CSS filter string around a node's own draw (via
// state.filter), so the "native drop shadow" is just the source bitmap with a `drop-shadow(...)` CSS
// filter bound to it. computeDropShadowFilterCss produces the string (in app.ts); setCanvasCssFilter
// binds it; the normal render draws it. No extra render pass — the backend rasterizes the shadow itself.
import type { Bitmap, DisplayObject } from '@flighthq/sdk';
import {
  BitmapKind,
  createCanvasElement,
  createCanvasRenderState,
  createMatrix,
  defaultCanvasBitmapRenderer,
  enableCanvasCssFilter,
  prepareDisplayObjectRender,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasDisplayObject,
  setCanvasCssFilter,
} from '@flighthq/sdk';

import { registerFunctionalTarget } from '../../_harness/verify';
import type { ParityTarget } from './parity';

export function createParityTarget(width: number, height: number, background: number): ParityTarget {
  const pixelRatio = window.devicePixelRatio || 1;
  const canvas = createCanvasElement(width, height, pixelRatio);
  document.body.appendChild(canvas);

  const state = createCanvasRenderState(canvas, {
    pixelRatio,
    backgroundColor: background,
    contextAttributes: { alpha: false },
  });
  // Device transform carries DPI: the scene is authored in logical units, scaled to the backing store.
  state.renderTransform2D = createMatrix(pixelRatio, 0, 0, pixelRatio, 0, 0);

  registerRenderer(state, BitmapKind, defaultCanvasBitmapRenderer);
  // The native drop shadow is a CSS filter bound per node; the resolver must be installed to honor it.
  enableCanvasCssFilter(state);

  registerFunctionalTarget({
    kind: 'canvas',
    state,
    width,
    height,
    scale: pixelRatio,
    render: (root: DisplayObject) => renderParity(state, root),
  });

  return {
    kind: 'canvas',
    width,
    height,
    scale: pixelRatio,
    applyNativeDropShadow(node: Bitmap, css: string): void {
      setCanvasCssFilter(state, node, css);
    },
    render(root: DisplayObject): void {
      renderParity(state, root);
    },
  };
}

function renderParity(state: ReturnType<typeof createCanvasRenderState>, root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderCanvasBackground(state);
  renderCanvasDisplayObject(state, root);
}
