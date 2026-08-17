// bitmap-transform-rotation — validates that a bitmap renders correctly after a rotation transform.
//
// Creates a 100x100 red procedural bitmap, positions it at (200,150), and rotates it 45 degrees.
// The oracle verifies:
//   - the center of the rotated bitmap shows the red bitmap content,
//   - a corner of the original unrotated bounding box (now outside due to rotation) is background
//     black — proving the rotation actually occurred.
//
// Transform rotation composited with bitmap rendering is inherently visual — jsdom has no
// rendering pipeline.
import type { Bitmap } from '@flighthq/sdk';
import {
  addNodeChild,
  SpriteKind,
  createSprite,
  createDisplayObject,
  createImageResource,
  createTexture,
  getBitmapPixelRgb,
  invalidateNodeAppearance,
  invalidateNodeLocalTransform,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 400;
const HEIGHT = 300;
const SIZE = 100;

const { render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff,
  kinds: [SpriteKind],
  expectedImageDescription:
    'On an opaque black field: a flat red diamond (a 100×100 square rotated 45° around its ' +
    'center) centered at (200, 150). The diamond spans roughly 70 px along each axis from ' +
    'the center. The interior is uniformly red; the four axis-aligned corners of the original ' +
    'unrotated bounding box (e.g. top-left near (150, 100)) are exposed as black background, ' +
    'proving the rotation occurred. No other colors, no gradient, no anti-aliased fringe ' +
    'beyond the rotated edges.',
});

const canvas = document.createElement('canvas');
canvas.width = SIZE;
canvas.height = SIZE;
const ctx = canvas.getContext('2d')!;
ctx.fillStyle = '#ff0000';
ctx.fillRect(0, 0, SIZE, SIZE);

const imageResource = createImageResource(canvas);

const root = createDisplayObject();

const bitmap = createSprite();
bitmap.data.texture = createTexture({ dimension: '2d', source: imageResource });
bitmap.x = 200;
bitmap.y = 150;
bitmap.rotation = 45;
bitmap.pivotX = SIZE / 2;
bitmap.pivotY = SIZE / 2;
invalidateNodeLocalTransform(bitmap);
invalidateNodeAppearance(bitmap);
addNodeChild(root, bitmap);

render(root);

export function assertRender(frame: Readonly<Bitmap>): void {
  const s = frame.width / width;
  const at = (x: number, y: number): number => getBitmapPixelRgb(frame, Math.round(x * s), Math.round(y * s));

  const center = at(200, 150);
  if (!isRed(center)) {
    throw new Error(`[bitmap-transform-rotation] center expected red, got #${hex(center)}`);
  }

  const corner = at(200 - SIZE / 2, 150 - SIZE / 2);
  if (!isBlack(corner)) {
    throw new Error(`[bitmap-transform-rotation] corner expected black (rotated away), got #${hex(corner)}`);
  }
}

function isRed(rgb: number): boolean {
  return ((rgb >> 16) & 0xff) > 180 && ((rgb >> 8) & 0xff) < 90 && (rgb & 0xff) < 90;
}
function isBlack(rgb: number): boolean {
  return ((rgb >> 16) & 0xff) < 30 && ((rgb >> 8) & 0xff) < 30 && (rgb & 0xff) < 30;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
