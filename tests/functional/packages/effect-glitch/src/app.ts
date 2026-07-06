// Bright horizontal colour bars — the structure glitch tears: each block of rows is displaced and the
// RGB channels separated, so the bars break into offset, colour-fringed segments. A clean, high-contrast
// scene makes the tear and channel-shift unmistakable.
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  createDisplayContainer,
  createShape,
} from '@flighthq/sdk';

import { height, render, scale, width } from './render';

const root = createDisplayContainer();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const colors = [0xff3366ff, 0x33ff99ff, 0x3399ffff, 0xffcc33ff, 0xcc33ffff];
for (let i = 0; i < colors.length; i++) {
  const bar = createShape();
  appendShapeBeginFill(bar, colors[i], 1);
  appendShapeRectangle(bar, 0, 0, logicalWidth * 0.62, logicalHeight * 0.12);
  appendShapeEndFill(bar);
  bar.x = logicalWidth * 0.19;
  bar.y = logicalHeight * (0.1 + i * 0.16);
  addNodeChild(root, bar);
}

render(root);
