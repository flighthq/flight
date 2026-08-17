// bitmap-color-transform — validates ColorScaleBias applied to image pixels: a white source tinted with
// red scale 1 and green/blue scales 0 renders pure red. The scene blits the
// untinted white source and the tinted result side by side; pixel sampling proves the source is white and
// the transformed bitmap is red (high red, low green/blue) — i.e. the per-channel scales were applied.
//
// This is visual because color scale/bias is per-pixel channel math — confirming it means
// reading the rasterized output and seeing white become red.
//
// API note: Flight models draw-time color adjustment as a base-Node adjustment stack, folded through the
// registered GL/WGPU material feature. Canvas and DOM do not realize that fold, so this cross-backend
// fixture instead applies the same ColorScaleBias to source pixels via applyBitmapColorScaleBias before
// blitting. The dedicated color-adjustment scenes exercise the GPU-batched node path.
import type { Bitmap } from '@flighthq/sdk';
import {
  addNodeChild,
  applyBitmapColorScaleBias,
  SpriteKind,
  createSprite,
  createColorScaleBias,
  createDisplayObject,
  createImageResourceFromCanvas,
  createPixelArtSampler,
  createBitmap,
  createBitmapRegion,
  createTexture,
  getBitmapPixelRgb,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

const TILE = 200;
const SOURCE_X = 140;
const RESULT_X = 460;
const TILE_Y = 200;

// Opaque white source.
const source = createBitmap(TILE, TILE, 0xffffffff);

// Red tint: keep red, zero green/blue, use zero bias, and keep alpha.
const redTint = createColorScaleBias({
  redScale: 1,
  greenScale: 0,
  blueScale: 0,
  alphaScale: 1,
});

// Apply the transform into a separate destination surface (read-then-write per pixel).
const result = createBitmap(TILE, TILE, 0x000000ff);
applyBitmapColorScaleBias(createBitmapRegion(result), createBitmapRegion(source), redTint);

const { render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff, // opaque black (packed RGBA, low byte = alpha)
  kinds: [SpriteKind],
  expectedImageDescription:
    'On an opaque black field, two 200x200 squares sit side by side at the same height (y 200-400), ' +
    'separated by a band of background. The LEFT square (x 140-340) is flat opaque WHITE — the untouched ' +
    'source. The RIGHT square (x 460-660) is flat PURE RED (full red, zero green, zero blue) — the same ' +
    'source after the per-channel scale. Both squares are uniform: no gradient, no tint on the white one, ' +
    'and no orange or pink cast on the red one. Every other pixel is black.',
});

const root = createDisplayObject();

function blit(bitmap: Readonly<Bitmap>, x: number): void {
  const canvas = document.createElement('canvas');
  canvas.width = TILE;
  canvas.height = TILE;
  canvas.getContext('2d')!.putImageData(new ImageData(bitmap.data, TILE, TILE), 0, 0);
  const bmp = createSprite();
  bmp.data.texture = createTexture({
    sampler: createPixelArtSampler(),
    dimension: '2d',
    source: createImageResourceFromCanvas(canvas),
  });
  bmp.x = x;
  bmp.y = TILE_Y;
  addNodeChild(root, bmp);
}

blit(source, SOURCE_X);
blit(result, RESULT_X);

render(root);

export function assertRender(frame: Readonly<Bitmap>): void {
  const s = frame.width / width; // device-pixel scale
  const at = (x: number, y: number): number => getBitmapPixelRgb(frame, Math.round(x * s), Math.round(y * s));

  // Source bitmap is white (the untinted control).
  const white = at(SOURCE_X + TILE / 2, TILE_Y + TILE / 2);
  if (!isWhite(white)) {
    throw new Error(`[bitmap-color-transform] source bitmap not white — got #${hex(white)}`);
  }

  // Transformed bitmap is red — sample several interior points.
  const samples: readonly (readonly [number, number])[] = [
    [TILE * 0.3, TILE * 0.3],
    [TILE * 0.5, TILE * 0.5],
    [TILE * 0.7, TILE * 0.7],
  ];
  for (const [lx, ly] of samples) {
    const c = at(RESULT_X + lx, TILE_Y + ly);
    if (!isRed(c)) {
      throw new Error(`[bitmap-color-transform] tinted bitmap not red at (${lx},${ly}) — got #${hex(c)}`);
    }
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
function isWhite(rgb: number): boolean {
  return channel(rgb, 16) > 200 && channel(rgb, 8) > 200 && channel(rgb, 0) > 200;
}
function isRed(rgb: number): boolean {
  return channel(rgb, 16) > 180 && channel(rgb, 8) < 90 && channel(rgb, 0) < 90;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
