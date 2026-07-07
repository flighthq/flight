// DOM backend of the blur-parity test.
//
// Native path: the DOM renderer applies a CSS filter via the element's style.filter, so the "native
// blur" is the source bitmap with a `blur(Npx)` CSS filter bound to it. computeBlurFilterCss produces
// the string; setDomCssFilter binds it; the normal render emits it. The browser rasterizes the blur.
//
// The DOM backend renders to elements, not a canvas, so the verifier's canvas-readback oracle does NOT
// run for DOM (snapshotFunctionalRender returns null for a DOM target → assertRender is skipped). DOM
// parity is therefore best-effort: the not-blank check confirms the element tree was emitted, and the
// canvas/Gl oracles carry the precise pixel parity assertion.
import type { Bitmap, BlurFilter, DisplayObject } from '@flighthq/sdk';
import {
  BitmapKind,
  computeBlurFilterCss,
  createDomRenderState,
  defaultDomBitmapRenderer,
  enableDomCssFilterSupport,
  prepareDisplayObjectRender,
  registerRenderer,
  renderDomBackground,
  renderDomDisplayObject,
  setDomCssFilter,
} from '@flighthq/sdk';
import { registerFunctionalTarget } from '@ft/verify';

import type { ParityTarget } from './parity';

export function createParityTarget(width: number, height: number, background: number): ParityTarget {
  // DOM has no backing store and needs no device transform — the browser rasterizes at device
  // resolution itself, so the scene is authored in logical units and scale stays 1.
  const container = document.createElement('div');
  container.style.position = 'relative';
  container.style.width = `${width}px`;
  container.style.height = `${height}px`;
  document.body.appendChild(container);

  const state = createDomRenderState(container, { backgroundColor: background });

  registerRenderer(state, BitmapKind, defaultDomBitmapRenderer);
  enableDomCssFilterSupport(state);

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
    applyNativeBlur(node: Bitmap, filter: Readonly<BlurFilter>): void {
      const css = computeBlurFilterCss(filter);
      if (css !== null) setDomCssFilter(state, node, css);
    },
    render(root: DisplayObject): void {
      renderParity(state, root);
    },
  };
}

function renderParity(state: ReturnType<typeof createDomRenderState>, root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderDomBackground(state);
  renderDomDisplayObject(state, root);
}
