// Canvas backend of the displacement-map-parity test.
//
// DisplacementMapFilter has no native CSS form, so there is no native filter path on Canvas. The NATIVE
// tile (drawn by app.ts as the CPU/surface result) and the REFERENCE tile are identical bitmaps — parity
// holds by construction here, and drawNativeDisplacement is unused. The normal render draws both tiles;
// Gl carries the meaningful shader-vs-CPU comparison.
import type { DisplayObject } from '@flighthq/sdk';
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
