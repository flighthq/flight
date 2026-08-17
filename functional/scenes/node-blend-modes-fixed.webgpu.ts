import type { Bitmap } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  SpriteKind,
  BlendMode,
  createSprite,
  createDisplayObject,
  createImageResourceFromCanvas,
  createShape,
  createTexture,
  getBitmapPixelRgb,
  invalidateNodeAppearance,
  invalidateNodeLocalTransform,
  ShapeKind,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

// WebGPU-only coverage for the complete fixed-function node BlendMode set. Six tessellated Shape
// probes cover every state, and a Bitmap Multiply probe exercises the sprite-batch pipeline separately.
const BASE_GRAY = 0x808080ff;
const BAND_X = 40;
const BAND_Y = 50;
const BAND_W = 720;
const BAND_H = 500;
const OVERLAY_W = 140;
const OVERLAY_H = 80;
const PROBES: readonly (readonly [number, number, number, BlendMode, number])[] = [
  [100, 100, 0x505050ff, BlendMode.Normal, 80],
  [330, 100, 0x505050ff, BlendMode.Add, 208],
  [560, 100, 0x808080ff, BlendMode.Multiply, 64],
  [100, 260, 0x808080ff, BlendMode.Screen, 192],
  [330, 260, 0x404040ff, BlendMode.Darken, 64],
  [560, 260, 0xc0c0c0ff, BlendMode.Lighten, 192],
];
const BITMAP_X = 100;
const BITMAP_Y = 420;

const { render, width } = await createFunctionalTarget({
  width: 800,
  height: 600,
  background: 0x000000ff,
  kinds: [SpriteKind, ShapeKind],
  blend: true,
  expectedImageDescription:
    'On an opaque black field (800×600): a mid-gray (luma ~128) rectangle spanning x 40–760, ' +
    'y 50–550. Inside it, six 140×80 overlay rectangles arranged in a 3×2 grid plus one ' +
    'bitmap probe below. Top row (y 100): Normal at x 100 (luma ~80, darker than base), ' +
    'Add at x 330 (luma ~208, brighter), Multiply at x 560 (luma ~64, darker). Bottom row ' +
    '(y 260): Screen at x 100 (luma ~192, brighter), Darken at x 330 (luma ~64, darker), ' +
    'Lighten at x 560 (luma ~192, brighter). A seventh Multiply-blended bitmap rectangle ' +
    '(140×80) at x 100, y 420 also reads luma ~64. Each overlay region is visibly distinct ' +
    'from the surrounding mid-gray base.',
});

const root = createDisplayObject();
const base = createShape();
appendShapeBeginFill(base, BASE_GRAY, 1);
appendShapeRectangle(base, BAND_X, BAND_Y, BAND_W, BAND_H);
appendShapeEndFill(base);
addNodeChild(root, base);
for (const [x, y, color, mode] of PROBES) addOverlay(x, y, color, mode);
addMultiplyBitmap();
render(root);

function addOverlay(x: number, y: number, color: number, blendMode: BlendMode): void {
  const overlay = createShape();
  appendShapeBeginFill(overlay, color, 1);
  appendShapeRectangle(overlay, x, y, OVERLAY_W, OVERLAY_H);
  appendShapeEndFill(overlay);
  overlay.blendMode = blendMode;
  invalidateNodeAppearance(overlay);
  addNodeChild(root, overlay);
}

function addMultiplyBitmap(): void {
  const source = document.createElement('canvas');
  source.width = OVERLAY_W;
  source.height = OVERLAY_H;
  const context = source.getContext('2d')!;
  context.fillStyle = '#808080';
  context.fillRect(0, 0, source.width, source.height);
  const bitmap = createSprite();
  bitmap.data.texture = createTexture({
    dimension: '2d',
    source: createImageResourceFromCanvas(source),
  });
  bitmap.blendMode = BlendMode.Multiply;
  bitmap.x = BITMAP_X;
  bitmap.y = BITMAP_Y;
  invalidateNodeAppearance(bitmap);
  invalidateNodeLocalTransform(bitmap);
  addNodeChild(root, bitmap);
}

export function assertRender(frame: Readonly<Bitmap>): void {
  const s = frame.width / width;
  const at = (x: number, y: number): number => getBitmapPixelRgb(frame, Math.round(x * s), Math.round(y * s));
  const baseLuma = luma(at(BAND_X + 20, BAND_Y + 20));
  if (baseLuma < 100 || baseLuma > 160) {
    throw new Error(`[node-blend-modes-fixed] base gray luma ${baseLuma.toFixed(0)} not near 128`);
  }
  for (const [x, y, , mode, expected] of PROBES) {
    const actual = luma(at(x + OVERLAY_W / 2, y + OVERLAY_H / 2));
    if (Math.abs(actual - expected) > 28) {
      throw new Error(`[node-blend-modes-fixed] ${mode} luma ${actual.toFixed(0)} not near ${expected}`);
    }
  }
  const bitmapMultiply = luma(at(BITMAP_X + OVERLAY_W / 2, BITMAP_Y + OVERLAY_H / 2));
  if (Math.abs(bitmapMultiply - 64) > 28) {
    throw new Error(`[node-blend-modes-fixed] Bitmap Multiply luma ${bitmapMultiply.toFixed(0)} not near 64`);
  }
}

function luma(rgb: number): number {
  return 0.299 * ((rgb >> 16) & 255) + 0.587 * ((rgb >> 8) & 255) + 0.114 * (rgb & 255);
}
