// Simple shapes on a neutral field. With an empty effect pipeline, the presented frame must match a
// plain direct render exactly — so these flat, axis-aligned shapes make any unintended tint, blur, or
// offset from the passthrough path easy to spot.
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

const colors = [0xff5c5cff, 0x5cff5cff, 0x5c5cffff, 0xffff5cff];
for (let i = 0; i < colors.length; i++) {
  const shape = createShape();
  appendShapeBeginFill(shape, colors[i], 1);
  appendShapeRectangle(shape, -70, -70, 140, 140);
  appendShapeEndFill(shape);
  shape.x = logicalWidth * (0.28 + 0.44 * (i % 2));
  shape.y = logicalHeight * (0.3 + 0.4 * Math.floor(i / 2));
  addNodeChild(root, shape);
}

render(root);
