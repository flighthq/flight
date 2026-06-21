// A bright square masked by a TRIANGULAR (non-rectangular) contour clip, rendered through an HDR
// (rgba16float) effect pipeline. The contour clip is realized by a stencil pass, whose pipeline must
// match the effect target's color format — this is the regression test for the WebGPU clip-contour
// pipeline being keyed on the current color format (otherwise the stencil pipeline, built for the canvas
// rgba8 format, mismatches the rgba16float scene target and the frame is blank/invalid).
import {
  addNodeChild,
  appendPathLineTo,
  appendPathMoveTo,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  createClipRegionFromPath,
  createDisplayContainer,
  createPath,
  createShape,
  setDisplayObjectClip,
} from '@flighthq/sdk';

import { height, render, scale, width } from './render';

const root = createDisplayContainer();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const HALF = 150;
const shape = createShape();
appendShapeBeginFill(shape, 0x88ddffff, 1);
appendShapeRectangle(shape, -HALF, -HALF, HALF * 2, HALF * 2);
appendShapeEndFill(shape);
shape.x = logicalWidth / 2;
shape.y = logicalHeight / 2;

// Triangular contour clip in the shape's local space — a non-rectangular region, so it goes through the
// stencil contour path (not the scissor-rect fast path).
const clipPath = createPath();
appendPathMoveTo(clipPath, -HALF, HALF);
appendPathLineTo(clipPath, HALF, HALF);
appendPathLineTo(clipPath, 0, -HALF);
appendPathLineTo(clipPath, -HALF, HALF);
setDisplayObjectClip(shape, createClipRegionFromPath(clipPath));

addNodeChild(root, shape);
render(root);
