// Requires: assets/wabbit_alpha.png
// Port of GlowTest. Shows 4 bitmaps with glow filter variants.
// TODO: animated glow requires display-object-level filter support.
// Currently shows the bitmaps unfiltered as a placeholder layout.
// Variants: normal, inner, knockout, inner+knockout
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  createBitmap,
  createDisplayContainer,
  createRichText,
  createShape,
  loadImageResourceFromURL,
} from '@flighthq/sdk';

import { height, render, width } from './render';

const root = createDisplayContainer();

const W = width;
const H = height;

const bg = createShape();
appendShapeBeginFill(bg, 0xffffff);
appendShapeRectangle(bg, 0, 0, W, H);
appendShapeEndFill(bg);
addNodeChild(root, bg);

const image = await loadImageResourceFromURL('assets/wabbit_alpha.png');

const labels = ['normal', 'inner', 'knockout', 'inner + knockout'];
for (let i = 0; i < 4; i++) {
  const bmp = createBitmap();
  bmp.data.image = image;
  bmp.data.smoothing = true;
  bmp.x = 50 + i * (image.width + 50);
  bmp.y = 50;
  addNodeChild(root, bmp);

  const lbl = createRichText();
  lbl.data.defaultTextFormat = { font: 'sans-serif', size: 14, color: 0x444444 };
  lbl.x = bmp.x;
  lbl.y = bmp.y + image.height + 8;
  lbl.data.width = image.width + 40;
  lbl.data.height = 24;
  lbl.data.text = labels[i];
  addNodeChild(root, lbl);
}

const todo = createRichText();
todo.data.defaultTextFormat = { font: 'sans-serif', size: 16, color: 0xff0000 };
todo.x = 10;
todo.y = H - 30;
todo.data.width = W - 20;
todo.data.height = 24;
todo.data.text = 'TODO: animated glow requires display-object-level filter support';
addNodeChild(root, todo);

render(root);
