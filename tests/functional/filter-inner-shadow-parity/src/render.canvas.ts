// Canvas backend of the inner-shadow-parity test.
//
// Inner shadow has no CSS form, so there is no native Canvas filter path: the NATIVE tile is the SAME
// surface-reference bitmap app.ts already drew (parity holds by construction). applyNativeInnerShadow is
// a no-op and there is no drawNativeInnerShadow. This backend exists to prove the harness wiring; WebGL
// carries the real shader-vs-CPU comparison.
import type { Bitmap, DisplayObject, InnerShadowFilter } from '@flighthq/sdk';
import {
  BitmapKind,
  createCanvasElement,
  createCanvasRenderState,
  createMatrix,
  defaultCanvasBitmapRenderer,
  prepareDisplayObjectRender,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasDisplayObject,
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
    // No native inner-shadow CSS form — the native tile is the surface reference bitmap drawn by app.ts.
    applyNativeInnerShadow(_node: Bitmap, _filter: Readonly<InnerShadowFilter>): void {},
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
