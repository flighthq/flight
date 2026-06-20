// A spread of distinct, saturated colors so the grade's saturation/contrast/temperature shifts are
// visible across hues rather than on a single tone.
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

const colors = [0xff3b30ff, 0x34c759ff, 0x007affff, 0xffcc00ff, 0xaf52deff, 0xff9500ff];
for (let i = 0; i < colors.length; i++) {
  const shape = createShape();
  appendShapeBeginFill(shape, colors[i], 1);
  appendShapeRectangle(shape, -60, -80, 120, 160);
  appendShapeEndFill(shape);
  shape.x = logicalWidth * (0.18 + 0.32 * (i % 3));
  shape.y = logicalHeight * (0.32 + 0.4 * Math.floor(i / 3));
  addNodeChild(root, shape);
}

render(root);
