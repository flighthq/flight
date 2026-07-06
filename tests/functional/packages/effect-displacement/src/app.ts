// Sharp colour bars with crisp horizontal/vertical edges — the structure the displacement warp bends.
// The animated sine field wobbles the sample position, so the straight bar edges become wavy.
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

const colors = [0xff5c5cff, 0x5cff9cff, 0x5c9cffff, 0xffd25cff, 0xcc5cffff];
for (let i = 0; i < colors.length; i++) {
  const bar = createShape();
  appendShapeBeginFill(bar, colors[i], 1);
  appendShapeRectangle(bar, 0, 0, logicalWidth * 0.64, logicalHeight * 0.13);
  appendShapeEndFill(bar);
  bar.x = logicalWidth * 0.18;
  bar.y = logicalHeight * (0.08 + i * 0.17);
  addNodeChild(root, bar);
}

render(root);
