// bitmap-color-transform — validates a ColorTransform applied to image pixels: a white source tinted by
// a transform with red multiplier 1 and green/blue multipliers 0 renders pure red. The scene blits the
// untinted white source and the tinted result side by side; the oracle proves the source is white and
// the transformed bitmap is red (high red, low green/blue) — i.e. the color transform's per-channel
// multipliers were applied.
//
// This is visual because a color transform's effect is per-pixel channel scaling — confirming it means
// reading the rasterized output and seeing white become red.
//
// API note: Flight models a color transform as the node-level HasColorTransform trait
// (packages/types/src/HasColorTransform.ts), an Adjustment folded directly into the GL/WGPU batch
// draw (packages/displayobject-gl/src/glSpriteBatch.ts recordGlSpriteBatchColorTransform, and the
// WGPU sibling). The Canvas and DOM bitmap renderers do not yet realize that trait, so a node-attached
// color transform draws untinted there — diverging across backends. Functional tests must agree
// byte-for-byte across Canvas/DOM/GL, so this test instead applies the transform to the source PIXELS
// in JS via the genuine `applySurfaceColorTransform` (the surface ColorTransform API) and a
// `createColorTransform` descriptor, then blits the result. Every backend then draws identical bytes
// (the same pattern filter-pixelate uses). The node-trait fold is the GPU-batched form of the same
// descriptor; it is exercised by the GL/WGPU sprite-batch unit tests, not here.
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  applySurfaceColorTransform,
  BitmapKind,
  createBitmap,
  createColorTransform,
  createDisplayContainer,
  createImageResourceFromCanvas,
  createSurface,
  createSurfaceRegion,
  getSurfacePixelRgb,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

const TILE = 200;
const SOURCE_X = 140;
const RESULT_X = 460;
const TILE_Y = 200;

// Opaque white source.
const source = createSurface(TILE, TILE, 0xffffffff);

// Red tint: keep red, zero out green and blue (multipliers), no offsets, keep alpha.
const redTint = createColorTransform({
  redMultiplier: 1,
  greenMultiplier: 0,
  blueMultiplier: 0,
  alphaMultiplier: 1,
});

// Apply the transform into a separate destination surface (read-then-write per pixel).
const result = createSurface(TILE, TILE, 0x000000ff);
applySurfaceColorTransform(createSurfaceRegion(result), createSurfaceRegion(source), redTint);

const { render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff, // opaque black (packed RGBA, low byte = alpha)
  kinds: [BitmapKind],
});

const root = createDisplayContainer();

function blit(surface: Readonly<Surface>, x: number): void {
  const canvas = document.createElement('canvas');
  canvas.width = TILE;
  canvas.height = TILE;
  canvas.getContext('2d')!.putImageData(new ImageData(surface.data, TILE, TILE), 0, 0);
  const bmp = createBitmap();
  bmp.data.image = createImageResourceFromCanvas(canvas);
  bmp.data.smoothing = false;
  bmp.x = x;
  bmp.y = TILE_Y;
  addNodeChild(root, bmp);
}

blit(source, SOURCE_X);
blit(result, RESULT_X);

render(root);

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));

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
