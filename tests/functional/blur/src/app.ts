// Requires: assets/wabbit_alpha.png
// Three bitmaps with blur filters of increasing strength (Gaussian standard deviation
// 4 / 8 / 12 px). Demonstrates the createBlurFilter → filterToCSS → setCanvasCSSFilter
// seam: the abstract filter descriptor is created here, and the render layer realizes it
// per backend (CSS filter on canvas/DOM; the offscreen path on WebGL).
import { type BitmapFilter, createBlurFilter } from '@flighthq/filters';
import type { DisplayObject } from '@flighthq/sdk';
import {
  addSceneChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  createBitmap,
  createDisplayContainer,
  createRichText,
  createShape,
  loadImageSourceFromURL,
} from '@flighthq/sdk';

import { applyFilters, height, render, scale, width } from './render';

const root = createDisplayContainer();
root.scaleX = scale;
root.scaleY = scale;

const W = width / scale;
const H = height / scale;

const bg = createShape();
appendShapeBeginFill(bg, 0xffffff);
appendShapeRectangle(bg, 0, 0, W, H);
appendShapeEndFill(bg);
addSceneChild(root, bg);

const image = await loadImageSourceFromURL('assets/wabbit_alpha.png');

const filtered: { node: DisplayObject; filter: BitmapFilter }[] = [];

for (let i = 0; i < 3; i++) {
  const bmp = createBitmap();
  bmp.data.image = image;
  bmp.data.smoothing = true;
  bmp.x = 50 + i * (image.width + 50);
  bmp.y = 50;
  addSceneChild(root, bmp);

  // blurX/blurY are the Gaussian standard deviation in pixels — consistent across the
  // CSS, surface, and WebGL paths.
  const sigma = (i + 1) * 4;
  filtered.push({ node: bmp, filter: createBlurFilter({ blurX: sigma, blurY: sigma }) });

  const lbl = createRichText();
  lbl.data.defaultTextFormat = { font: 'sans-serif', size: 14, color: 0x444444 };
  lbl.x = bmp.x;
  lbl.y = bmp.y + image.height + 8;
  lbl.data.width = image.width;
  lbl.data.height = 24;
  lbl.data.text = `blur σ=${sigma}px`;
  addSceneChild(root, lbl);
}

applyFilters(filtered);
render(root);
