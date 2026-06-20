// A single full-bleed bright fill covering the whole frame. With a flat, even color the vignette's
// corner darkening is the only variation in the image.
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
appendShapeBeginFill(fill, 0xe8ecf4ff, 1);
appendShapeRectangle(fill, 0, 0, logicalWidth, logicalHeight);
appendShapeEndFill(fill);
addNodeChild(root, fill);

render(root);
