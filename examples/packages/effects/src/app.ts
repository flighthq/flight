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
  createWhiteBalanceEffect,
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
appendShapeRectangle(center, -50, -50, 100, 100);
appendShapeEndFill(center);
center.x = 400;
center.y = 300;
center.rotation = 45;
invalidateNodeLocalTransform(center);
addNodeChild(root, center);

// Effect chain: isolate highlights, focus the frame, grade it warmer, then tone-map HDR to display.
const effects: readonly RenderEffect[] = [
  createBloomEffect({ threshold: 0.5, intensity: 1.2, radius: 10 }),
  createVignetteEffect({ intensity: 0.72 }),
  createWhiteBalanceEffect({ temperature: 0.18, tint: -0.04 }),
  createToneMapEffect({ operator: 'aces', exposure: 1.2 }),
];

render(root, effects);
