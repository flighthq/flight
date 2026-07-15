import type { RenderEffect } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeCircle,
  appendShapeEndFill,
  appendShapeRectangle,
  createBloomEffect,
  createDisplayContainer,
  createShape,
  createToneMapEffect,
  createVignetteEffect,
  invalidateNodeLocalTransform,
} from '@flighthq/sdk';

import { render, scale } from './render';

const root = createDisplayContainer();
root.scaleX = scale;
root.scaleY = scale;

// Bright shapes on a dark background — bloom makes them glow, vignette draws focus
// to the center, and tone mapping compresses highlights.
const colors = [0xff3366, 0x33ff99, 0x3399ff, 0xffcc33, 0xff66cc];

for (let i = 0; i < colors.length; i++) {
  const shape = createShape();
  const angle = (i / colors.length) * Math.PI * 2;
  const cx = 400 + Math.cos(angle) * 180;
  const cy = 300 + Math.sin(angle) * 140;

  appendShapeBeginFill(shape, colors[i], 1);
  appendShapeCircle(shape, cx, cy, 60 + i * 8);
  appendShapeEndFill(shape);
  addNodeChild(root, shape);
}

// Center diamond shape.
const center = createShape();
appendShapeBeginFill(center, 0xffffff, 1);
appendShapeRectangle(center, 350, 250, 100, 100);
appendShapeEndFill(center);
center.rotation = 45;
center.pivotX = 400;
center.pivotY = 300;
invalidateNodeLocalTransform(center);
addNodeChild(root, center);

// Effect chain: bloom -> vignette -> tone map.
const effects: readonly RenderEffect[] = [
  createBloomEffect({ threshold: 0.5, intensity: 1.2 }),
  createVignetteEffect({ intensity: 0.8 }),
  createToneMapEffect({ operator: 'aces', exposure: 1.2 }),
];

render(root, effects);
