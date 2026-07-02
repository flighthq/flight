// Canvas backend of the inner-glow-parity test.
//
// Inner glow has no CSS form, so there is no native Canvas filter path: app.ts draws the surface
// reference bytes as the native tile, and parity holds by construction. This backend is therefore the
// minimal bitmap-rendering setup — applyNativeGlow is a no-op and drawNativeGlow is omitted.
import type { Bitmap, DisplayObject, InnerGlowFilter } from '@flighthq/sdk';
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
    applyNativeGlow(_node: Bitmap, _filter: Readonly<Omit<InnerGlowFilter, 'kind'>>): void {},
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
