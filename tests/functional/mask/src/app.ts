// Requires: assets/wabbit_alpha.png
// Port of MaskTest1. Tests display object masking with various offset configurations.
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  createBitmap,
  createDisplayContainer,
  createShape,
  loadImageResourceFromURL,
  setDisplayObjectMask,
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
const iw = image.width;
const ih = image.height;

// 4 masked bitmaps arranged in a 2x2 grid.
// Ghost bitmaps show the unmasked position at 30% opacity.
// Mask positions: [aligned, shifted -10,-10; shifted +25%,+25%; fully offscreen]
const maskOffsets = [
  { dx: 0, dy: 0 },
  { dx: -10, dy: -10 },
  { dx: iw / 4, dy: ih / 4 },
  { dx: W * 10, dy: H * 10 },
];

for (let i = 0; i < 4; i++) {
  const col = i % 2;
  const row = Math.floor(i / 2);
  const cx = col * (W / 3) + W / 6 - iw / 2;
  const cy = row === 0 ? ih / 2 : H / 2 + ih / 2;

  // Ghost at bitmap position
  const ghost = createBitmap();
  ghost.data.image = image;
  ghost.data.smoothing = true;
  ghost.alpha = 0.3;
  ghost.x = cx;
  ghost.y = cy;
  addNodeChild(root, ghost);

  // Ghost at mask position
  const ghostMask = createBitmap();
  ghostMask.data.image = image;
  ghostMask.data.smoothing = true;
  ghostMask.alpha = 0.3;
  ghostMask.x = cx + maskOffsets[i].dx;
  ghostMask.y = cy + maskOffsets[i].dy;
  addNodeChild(root, ghostMask);

  // Bitmap
  const bmp = createBitmap();
  bmp.data.image = image;
  bmp.data.smoothing = true;
  bmp.x = cx;
  bmp.y = cy;
  addNodeChild(root, bmp);

  // Mask bitmap
  const mask = createBitmap();
  mask.data.image = image;
  mask.data.smoothing = true;
  mask.x = cx + maskOffsets[i].dx;
  mask.y = cy + maskOffsets[i].dy;
  addNodeChild(root, mask);

  setDisplayObjectMask(bmp, mask);
}

render(root);
