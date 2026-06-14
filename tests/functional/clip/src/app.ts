// Requires: assets/wabbit_alpha.png
// Port of ClipTest1. Tests scrollRectangle clipping on bitmaps and rich text.
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
  setDisplayObjectClipRectangle,
} from '@flighthq/sdk';

import { height, render, scale, width } from './render';

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
const iw = image.width;
const ih = image.height;

// Ghost row (dim background at original positions)
for (let i = 0; i < 4; i++) {
  const ghost = createBitmap();
  ghost.data.image = image;
  ghost.data.smoothing = true;
  ghost.x = i * (W / 4) + W / 8 - iw / 2;
  ghost.y = ih / 2;
  ghost.alpha = 0.3;
  addNodeChild(root, ghost);
}

// Top row: 4 bitmaps with different scroll rect configurations
for (let i = 0; i < 4; i++) {
  const bmp = createBitmap();
  bmp.data.image = image;
  bmp.data.smoothing = true;
  bmp.x = i * (W / 4) + W / 8 - iw / 2;
  bmp.y = ih / 2;
  addNodeChild(root, bmp);

  if (i === 1) setDisplayObjectClipRectangle(bmp, { x: 0, y: 0, width: iw / 2, height: ih / 2 });
  if (i === 2) setDisplayObjectClipRectangle(bmp, { x: iw / 2, y: ih / 2, width: iw / 2, height: ih / 2 });
  if (i === 3) setDisplayObjectClipRectangle(bmp, { x: W * 2, y: H * 2, width: W * 10, height: H * 10 });
}

// Bottom row: 4 text fields with different scroll rect configurations
const textColors = [0xaa1100, 0x11aa00, 0x1100aa, 0x660066];
const textValues = ['Text Field 1', 'Text Field 2', 'Text Field 3', 'Text Field 4'];
for (let i = 0; i < 4; i++) {
  const tf = createRichText();
  tf.data.defaultTextFormat = { font: 'sans-serif', size: 32, color: textColors[i] };
  tf.x = i * (W / 4);
  tf.y = H / 2 + H / 4;
  tf.data.width = 400;
  tf.data.height = 400;
  tf.data.text = textValues[i];
  addNodeChild(root, tf);

  if (i === 1) setDisplayObjectClipRectangle(tf, { x: 0, y: 0, width: 200, height: 200 });
  if (i === 2) setDisplayObjectClipRectangle(tf, { x: 0, y: 40, width: 200, height: 20 });
  if (i === 3) setDisplayObjectClipRectangle(tf, { x: W * 2, y: H * 2, width: W * 10, height: H * 10 });
}

render(root);
