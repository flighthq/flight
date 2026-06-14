// Requires: assets/wabbit_alpha.png
// Three bitmaps with blur filters of increasing strength (Gaussian standard deviation
// 4 / 8 / 12 px). The abstract blur descriptor is created here once; each render layer then
// realizes it with the strategy that suits its substrate — there is no central dispatcher,
// the blur function is chosen per renderer by name:
//   - DOM:    element CSS filter (blurFilterToCSS → setDOMCSSFilter); the browser compositor
//             caches the result.
//   - Canvas: blurFilterToCSS baked once into an offscreen canvas registered as the node's
//             image-render cache, so repeated frames blit the cached bitmap instead of
//             re-running ctx.filter.
//   - WebGL:  offscreen render target + applyBlurFilterToWebGL shader passes, composited back
//             with drawWebGLRenderTargetResult.
// All three read blurX/blurY as the same Gaussian σ, so the columns should match visually.
import { type BlurFilter, createBlurFilter } from '@flighthq/filters';
import type { DisplayObject } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  createBitmap,
  createDisplayContainer,
  createRichText,
  createShape,
  loadImageSourceFromURL,
} from '@flighthq/sdk';

import { applyBlurFilters, height, render, scale, width } from './render';

const root = createDisplayContainer();
root.scaleX = scale;
root.scaleY = scale;

const W = width / scale;
const H = height / scale;

const bg = createShape();
appendShapeBeginFill(bg, 0xffffff);
appendShapeRectangle(bg, 0, 0, W, H);
appendShapeEndFill(bg);
addNodeChild(root, bg);

const image = await loadImageSourceFromURL('assets/wabbit_alpha.png');

const filtered: { node: DisplayObject; filter: BlurFilter }[] = [];

for (let i = 0; i < 3; i++) {
  const bmp = createBitmap();
  bmp.data.image = image;
  bmp.data.smoothing = true;
  bmp.x = 50 + i * (image.width + 50);
  bmp.y = 50;
  addNodeChild(root, bmp);

  // blurX/blurY are the Gaussian standard deviation in pixels (CSS blur(Xpx) uses sigma = X).
  // The BlurFilter intent maps to a true Gaussian on every backend — CSS blur() on DOM/Canvas,
  // applyGaussianBlurFilterToWebGL on WebGL — so the three columns match.
  const sigma = (i + 1) * 4;
  filtered.push({ node: bmp, filter: createBlurFilter({ blurX: sigma, blurY: sigma }) });

  const lbl = createRichText();
  lbl.data.defaultTextFormat = { font: 'sans-serif', size: 14, color: 0x444444 };
  lbl.x = bmp.x;
  lbl.y = bmp.y + image.height + 8;
  lbl.data.width = image.width;
  lbl.data.height = 24;
  lbl.data.text = `blur σ=${sigma}px`;
  addNodeChild(root, lbl);
}

applyBlurFilters(filtered);
render(root);
