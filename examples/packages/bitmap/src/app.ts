import type { DisplayObject } from '@flighthq/sdk';
import { addNodeChild, createBitmap, createDisplayObject, createImageResource } from '@flighthq/sdk';

import { render, scale } from './render';

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

// Gradient square: a colorful linear gradient from top-left to bottom-right.

const gradientBitmap = createBitmap();
gradientBitmap.data.image = createImageResource(createGradientImage(128, 128));
gradientBitmap.x = 60;
gradientBitmap.y = 60;
addNodeChild(root, gradientBitmap);

// Checkerboard pattern: demonstrates procedural pattern generation.

const checkerBitmap = createBitmap();
checkerBitmap.data.image = createImageResource(createCheckerboardImage(128, 128));
checkerBitmap.x = 340;
checkerBitmap.y = 60;
checkerBitmap.alpha = 0.5;
addNodeChild(root, checkerBitmap);

// Circle with radial gradient: scaled to 2x.

const circleBitmap = createBitmap();
circleBitmap.data.image = createImageResource(createRadialGradientImage(128, 128));
circleBitmap.x = 620;
circleBitmap.y = 60;
circleBitmap.scaleX = 2;
circleBitmap.scaleY = 2;
addNodeChild(root, circleBitmap);

// Rotated gradient square: the same gradient image rotated 30 degrees.

const rotatedBitmap = createBitmap();
rotatedBitmap.data.image = createImageResource(createGradientImage(96, 96));
rotatedBitmap.x = 200;
rotatedBitmap.y = 340;
rotatedBitmap.rotation = 30;
addNodeChild(root, rotatedBitmap);

// Combined properties: scaled, semi-transparent, and rotated checkerboard.

const combinedBitmap = createBitmap();
combinedBitmap.data.image = createImageResource(createCheckerboardImage(80, 80));
combinedBitmap.x = 500;
combinedBitmap.y = 340;
combinedBitmap.scaleX = 1.5;
combinedBitmap.scaleY = 1.5;
combinedBitmap.alpha = 0.7;
combinedBitmap.rotation = -15;
addNodeChild(root, combinedBitmap);

function enterFrame(): void {
  render(root as DisplayObject);
  requestAnimationFrame(enterFrame);
}

requestAnimationFrame(enterFrame);

function createGradientImage(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#ff6b6b');
  gradient.addColorStop(0.25, '#ffd93d');
  gradient.addColorStop(0.5, '#6bcb77');
  gradient.addColorStop(0.75, '#4d96ff');
  gradient.addColorStop(1, '#9b59b6');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  return c;
}

function createCheckerboardImage(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d')!;
  const tileSize = 16;
  for (let y = 0; y < height; y += tileSize) {
    for (let x = 0; x < width; x += tileSize) {
      const isEven = ((x / tileSize + y / tileSize) & 1) === 0;
      ctx.fillStyle = isEven ? '#2c3e50' : '#ecf0f1';
      ctx.fillRect(x, y, tileSize, tileSize);
    }
  }
  return c;
}

function createRadialGradientImage(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d')!;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(cx, cy);
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(0.4, '#f39c12');
  gradient.addColorStop(0.8, '#e74c3c');
  gradient.addColorStop(1, '#2c3e50');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  return c;
}
