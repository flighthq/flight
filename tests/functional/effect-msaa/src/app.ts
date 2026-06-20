// Rotated, slightly-skewed filled shapes whose long diagonal edges alias badly without MSAA. Rendered
// through the effect pipeline at sampleCount 4, the edges should come out smooth.
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

const colors = [0xff5c7cff, 0x5cff9cff, 0x5c9cffff, 0xffd25cff];
for (let i = 0; i < colors.length; i++) {
  const shape = createShape();
  appendShapeBeginFill(shape, colors[i], 1);
  appendShapeRectangle(shape, -90, -16, 180, 32);
  appendShapeEndFill(shape);
  shape.x = logicalWidth * (0.25 + 0.5 * (i % 2));
  shape.y = logicalHeight * (0.3 + 0.25 * Math.floor(i / 2));
  shape.rotation = 18 + i * 24;
  addNodeChild(root, shape);
}

render(root);
