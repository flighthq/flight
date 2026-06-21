// DOM backend of the bevel-parity test.
//
// There is NO CSS native bevel — the DOM cannot express a directional inner-bevel edge mask with a CSS
// filter string. So the "native" tile is the CPU/surface reference itself: app.ts draws the same
// reference bytes as the native tile bitmap, and applyNativeBevel is a no-op. Parity holds by
// construction on DOM; WebGL carries the meaningful shader-vs-CPU comparison.
//
// The DOM backend renders to elements, not a canvas, so the verifier's canvas-readback oracle does NOT
// run for DOM (snapshotFunctionalRender returns null for a DOM target → assertRender is skipped). DOM
// coverage is therefore best-effort: the not-blank check confirms the element tree was emitted, and the
// canvas/WebGL oracles carry the precise pixel parity assertion.
import type { Bitmap, DisplayObject } from '@flighthq/sdk';
import {
  BitmapKind,
  createDOMRenderState,
  defaultDOMBitmapRenderer,
  prepareDisplayObjectRender,
  registerRenderer,
  renderDOMBackground,
  renderDOMDisplayObject,
} from '@flighthq/sdk';

import { registerFunctionalTarget } from '../../_harness/verify';
import type { ParityTarget } from './parity';

export function createParityTarget(width: number, height: number, background: number): ParityTarget {
  // DOM has no backing store and needs no device transform — the browser rasterizes at device
  // resolution itself, so the scene is authored in logical units and scale stays 1.
  const container = document.createElement('div');
  container.style.position = 'relative';
  container.style.width = `${width}px`;
  container.style.height = `${height}px`;
  document.body.appendChild(container);

  const state = createDOMRenderState(container, { backgroundColor: background });

  registerRenderer(state, BitmapKind, defaultDOMBitmapRenderer);

  registerFunctionalTarget({
    kind: 'dom',
    state,
    width,
    height,
    scale: 1,
    render: (root: DisplayObject) => renderParity(state, root),
  });

  return {
    kind: 'dom',
    width,
    height,
    scale: 1,
    // No native bevel on DOM — the native tile is the reference bitmap app.ts already drew.
    applyNativeBevel(_node: Bitmap): void {},
    render(root: DisplayObject): void {
      renderParity(state, root);
    },
  };
}

function renderParity(state: ReturnType<typeof createDOMRenderState>, root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderDOMBackground(state);
  renderDOMDisplayObject(state, root);
}
