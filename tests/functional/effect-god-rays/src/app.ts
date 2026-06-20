// God rays radiate from a bright light center. A cluster of bright shapes surrounds the center point
// the effect samples toward, so the HDR pipeline can streak light outward from the occluded core.
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

// Bright core at the light center (centerX 0.5, centerY 0.4 in render.*.ts).
const core = createShape();
appendShapeBeginFill(core, 0xffffffff, 1);
appendShapeRectangle(core, -40, -40, 80, 80);
appendShapeEndFill(core);
core.x = logicalWidth * 0.5;
core.y = logicalHeight * 0.4;
addNodeChild(root, core);

const colors = [0xfff05cff, 0x5cffe0ff, 0xff5ce0ff, 0xffd45cff];
for (let i = 0; i < colors.length; i++) {
  const shape = createShape();
  appendShapeBeginFill(shape, colors[i], 1);
  appendShapeRectangle(shape, -50, -50, 100, 100);
  appendShapeEndFill(shape);
  const angle = (i / colors.length) * Math.PI * 2;
  shape.x = logicalWidth * 0.5 + Math.cos(angle) * logicalWidth * 0.28;
  shape.y = logicalHeight * 0.4 + Math.sin(angle) * logicalHeight * 0.28;
  shape.rotation = 12 + i * 20;
  addNodeChild(root, shape);
}

render(root);
