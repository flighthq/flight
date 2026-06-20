// A flat mid-gray fill covering the whole frame. The even tone is the ideal backdrop for film grain:
// the noise speckle is the only structure in the image.
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

const fill = createShape();
appendShapeBeginFill(fill, 0x808080ff, 1);
appendShapeRectangle(fill, 0, 0, logicalWidth, logicalHeight);
appendShapeEndFill(fill);
addNodeChild(root, fill);

render(root);
