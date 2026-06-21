// DOM backend of the median-parity test.
//
// The median filter has no native CSS form, so there is no DOM-native filter path. On DOM the "native"
// tile is the surface/CPU median result itself, blitted as a plain bitmap by app.ts — parity holds by
// construction. The DOM renderer draws to elements, not a canvas, so the verifier's canvas-readback
// oracle does NOT run for DOM (snapshotFunctionalRender returns null → assertRender is skipped). DOM
// parity is therefore best-effort via the harness not-blank check; the WebGL oracle carries the precise
// pixel parity assertion.
import type { Bitmap, DisplayObject, MedianFilter } from '@flighthq/sdk';
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
    // No native CSS median — the native tile is the CPU result bitmap added by app.ts.
    applyNativeMedian(_node: Bitmap, _filter: Readonly<MedianFilter>): void {},
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
