// bitmap-source-rect — validates BitmapData.sourceRectangle: a bitmap draws ONLY the sub-region of its
// image named by sourceRectangle, at that region's natural size, anchored at the bitmap origin. The
// source image is a 4-quadrant swatch (TL red, TR green, BL blue, BR white). One bitmap draws the full
// image (proving the quadrants are where we expect); a second sets sourceRectangle to the green TR
// quadrant only, and the oracle proves the cropped bitmap is uniformly green with none of the other
// three colors present.
//
// This is visual because cropping is a draw-time source-region selection — the only way to confirm it
// is to read the rasterized output and see exactly one quadrant's pixels, not the whole image.
//
// (Field confirmed in packages/types/src/Bitmap.ts: `sourceRectangle: Rectangle | null`, honored by the
// canvas, dom, gl, and wgpu bitmap renderers.)
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  BitmapKind,
  createBitmap,
  createDisplayContainer,
  createImageResourceFromCanvas,
  createRectangle,
  getSurfacePixelRgb,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

const QUAD = 100; // each quadrant is QUAD×QUAD; full image is 2*QUAD square (200×200).
const IMG = QUAD * 2;

// Full-image reference, top-left.
const FULL_X = 100;
const FULL_Y = 80;

// Cropped (green TR quadrant only), to the right.
const CROP_X = 420;
const CROP_Y = 80;

function buildQuadrantCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = IMG;
  canvas.height = IMG;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ff0000'; // TL red
  ctx.fillRect(0, 0, QUAD, QUAD);
  ctx.fillStyle = '#00ff00'; // TR green
  ctx.fillRect(QUAD, 0, QUAD, QUAD);
  ctx.fillStyle = '#0000ff'; // BL blue
  ctx.fillRect(0, QUAD, QUAD, QUAD);
  ctx.fillStyle = '#ffffff'; // BR white
  ctx.fillRect(QUAD, QUAD, QUAD, QUAD);
  return canvas;
}

const { render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff, // opaque black (packed RGBA, low byte = alpha)
  kinds: [BitmapKind],
});

const root = createDisplayContainer();

// Full image — reference that the quadrants are laid out as expected.
const full = createBitmap();
full.data.image = createImageResourceFromCanvas(buildQuadrantCanvas());
full.data.smoothing = false;
full.x = FULL_X;
full.y = FULL_Y;
addNodeChild(root, full);

// Cropped image — only the green TR quadrant (x=QUAD, y=0, w=QUAD, h=QUAD). It draws at the bitmap
// origin at QUAD×QUAD size.
const crop = createBitmap();
crop.data.image = createImageResourceFromCanvas(buildQuadrantCanvas());
crop.data.smoothing = false;
crop.data.sourceRectangle = createRectangle(QUAD, 0, QUAD, QUAD);
crop.x = CROP_X;
crop.y = CROP_Y;
addNodeChild(root, crop);

render(root);

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));

  // --- full image: confirm the four quadrants are where we expect ---
  if (!isRed(at(FULL_X + QUAD / 2, FULL_Y + QUAD / 2))) {
    throw new Error('[bitmap-source-rect] full-image TL quadrant not red');
  }
  if (!isGreen(at(FULL_X + QUAD + QUAD / 2, FULL_Y + QUAD / 2))) {
    throw new Error('[bitmap-source-rect] full-image TR quadrant not green');
  }
  if (!isBlue(at(FULL_X + QUAD / 2, FULL_Y + QUAD + QUAD / 2))) {
    throw new Error('[bitmap-source-rect] full-image BL quadrant not blue');
  }
  if (!isWhite(at(FULL_X + QUAD + QUAD / 2, FULL_Y + QUAD + QUAD / 2))) {
    throw new Error('[bitmap-source-rect] full-image BR quadrant not white');
  }

  // --- cropped image: the entire drawn QUAD×QUAD region is the green quadrant, uniformly ---
  const interior: readonly (readonly [number, number])[] = [
    [QUAD * 0.25, QUAD * 0.25],
    [QUAD * 0.75, QUAD * 0.25],
    [QUAD * 0.5, QUAD * 0.5],
    [QUAD * 0.25, QUAD * 0.75],
    [QUAD * 0.75, QUAD * 0.75],
  ];
  for (const [lx, ly] of interior) {
    const c = at(CROP_X + lx, CROP_Y + ly);
    if (!isGreen(c)) {
      throw new Error(`[bitmap-source-rect] cropped interior (${lx},${ly}) not green — got #${hex(c)}`);
    }
    // And explicitly NOT any of the other quadrant colors.
    if (isRed(c) || isBlue(c) || isWhite(c)) {
      throw new Error(`[bitmap-source-rect] cropped region leaked a non-green quadrant color — got #${hex(c)}`);
    }
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
function isRed(rgb: number): boolean {
  return channel(rgb, 16) > 180 && channel(rgb, 8) < 90 && channel(rgb, 0) < 90;
}
function isGreen(rgb: number): boolean {
  return channel(rgb, 16) < 90 && channel(rgb, 8) > 180 && channel(rgb, 0) < 90;
}
function isBlue(rgb: number): boolean {
  return channel(rgb, 16) < 90 && channel(rgb, 8) < 90 && channel(rgb, 0) > 180;
}
function isWhite(rgb: number): boolean {
  return channel(rgb, 16) > 200 && channel(rgb, 8) > 200 && channel(rgb, 0) > 200;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
