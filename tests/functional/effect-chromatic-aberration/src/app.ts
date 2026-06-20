// High-contrast white shapes on a dark field, pushed toward the corners where radial aberration is
// strongest. The crisp edges make the per-channel color fringing easy to see.
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

const positions = [
  [0.16, 0.2],
  [0.84, 0.2],
  [0.16, 0.8],
  [0.84, 0.8],
  [0.5, 0.5],
];
for (let i = 0; i < positions.length; i++) {
  const shape = createShape();
  appendShapeBeginFill(shape, 0xffffffff, 1);
  appendShapeRectangle(shape, -50, -50, 100, 100);
  appendShapeEndFill(shape);
  shape.x = logicalWidth * positions[i][0];
  shape.y = logicalHeight * positions[i][1];
  shape.rotation = i * 15;
  addNodeChild(root, shape);
}

render(root);
