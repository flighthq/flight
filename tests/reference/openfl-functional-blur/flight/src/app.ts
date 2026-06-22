// Requires: assets/wabbit_alpha.png
// Port of BlurTest1: three scaled bitmaps with increasing Gaussian blur, each labelled. The scene is
// renderer-agnostic; the per-backend render.<r>.ts (resolved via ./render) owns the offscreen blur path
// and exposes applyBlurFilters (register the blurred nodes) + render.
import { createBlurFilter } from '@flighthq/filters';
import {
  addNodeChild,
  createBitmap,
  createDisplayContainer,
  createRichText,
  loadImageResourceFromUrl,
} from '@flighthq/sdk';

import { applyBlurFilters, render } from './render';

const root = createDisplayContainer();

const image = await loadImageResourceFromUrl('assets/wabbit_alpha.png');
const SCALE = 5;
const bmpW = image.width * SCALE;
const bmpH = image.height * SCALE;

const blurred = [];
for (let i = 0; i < 3; i++) {
  const bmp = createBitmap();
  bmp.data.image = image;
  bmp.data.smoothing = true;
  bmp.scaleX = SCALE;
  bmp.scaleY = SCALE;
  bmp.x = 50 + i * (bmpW + 50);
  bmp.y = 50;
  const amount = 4 * (i + 1);
  const filter = createBlurFilter({ blurX: amount, blurY: amount });
  blurred.push({ node: bmp, filter });
  addNodeChild(root, bmp);

  const label = createRichText();
  label.data.defaultTextFormat = { font: 'sans-serif', size: 14, color: 0x444444 };
  label.x = bmp.x;
  label.y = bmp.y + bmpH + 8;
  label.data.width = bmpW;
  label.data.height = 24;
  label.data.text = `blur ${amount}`;
  addNodeChild(root, label);
}

applyBlurFilters(blurred);
render(root);
