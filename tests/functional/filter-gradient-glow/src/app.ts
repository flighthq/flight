// filter-gradient-glow — validates GradientGlowFilter on a centered white square.
//
// Surface-based filter pattern (see filter-color-matrix): build a known source surface, apply the
// filter ONCE via apply*FilterToSurface, then blit source | result 1:1 as bitmaps. The filter math
// runs on the surface in JS, so every backend draws identical bytes — exact cross-backend parity.
//
// gradientGlow writes a blurred MASK whose color is sampled from a gradient ramp keyed off the
// blurred silhouette alpha. Here the ramp runs transparent-black (ratio 0) → opaque-magenta
// (ratio 255), so the soft glow ring outside the square edges is magenta. To complete the effect we
// composite the glow mask first, then composite the original source on top. The result tile shows a
// magenta glow ring spilling outside the square's edges with the white square sitting on top.
import { applyGradientGlowFilterToSurface, createGradientGlowFilter } from '@flighthq/filters';
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  BitmapKind,
  createBitmap,
  createDisplayContainer,
  createImageResourceFromCanvas,
  createSurface,
  createSurfaceRegion,
  fillSurfaceRectangle,
  getSurfacePixelRGB,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const TILE = 256;
const SQUARE = 96;
const SQUARE_X = (TILE - SQUARE) / 2;
const SQUARE_Y = (TILE - SQUARE) / 2;
const SOURCE_X = 120;
const RESULT_X = 424;

// Source: a centered opaque white square on transparent black.
const source = createSurface(TILE, TILE, 0x00000000);
fillSurfaceRectangle(createSurfaceRegion(source, SQUARE_X, SQUARE_Y, SQUARE, SQUARE), 0xffffffff);

// Glow mask: gradient ramp transparent-black → opaque-magenta, blurred silhouette. Composite mask
// first, then source on top.
const mask = new Uint8ClampedArray(TILE * TILE * 4);
const blurBuffer = new Uint8ClampedArray(TILE * TILE * 4);
applyGradientGlowFilterToSurface(
  mask,
  blurBuffer,
  createSurfaceRegion(source),
  createGradientGlowFilter({
    colors: [0x000000, 0xff00ff],
    alphas: [0, 1],
    ratios: [0, 255],
    blurX: 8,
    blurY: 8,
    strength: 2,
  }),
);

// Composite: result = mask, then source-over on top (straight-alpha over).
const result = new Uint8ClampedArray(TILE * TILE * 4);
const src = source.data;
for (let i = 0; i < result.length; i += 4) {
  const sa = src[i + 3] / 255;
  const ma = mask[i + 3] / 255;
  const outA = sa + ma * (1 - sa);
  for (let c = 0; c < 3; c++) {
    const sc = src[i + c];
    const mc = mask[i + c];
    result[i + c] = outA > 0 ? Math.round((sc * sa + mc * ma * (1 - sa)) / outA) : 0;
  }
  result[i + 3] = Math.round(outA * 255);
}

const { height, render, width } = await createFunctionalTarget({
  width: 800,
  height: 600,
  background: 0xff000000,
  kinds: [BitmapKind],
});

const TOP = (height - TILE) / 2;
const root = createDisplayContainer();

function blit(data: Uint8ClampedArray, x: number): void {
  const canvas = document.createElement('canvas');
  canvas.width = TILE;
  canvas.height = TILE;
  canvas.getContext('2d')!.putImageData(new ImageData(data, TILE, TILE), 0, 0);
  const bmp = createBitmap();
  bmp.data.image = createImageResourceFromCanvas(canvas);
  bmp.data.smoothing = false;
  bmp.x = x;
  bmp.y = TOP;
  addNodeChild(root, bmp);
}

blit(source.data, SOURCE_X);
blit(result, RESULT_X);
render(root);

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale (canvas may be width × devicePixelRatio)

  const glowF = createGradientGlowFilter({
    colors: [0x000000, 0xff00ff],
    alphas: [0, 1],
    ratios: [0, 255],
    blurX: 8,
    blurY: 8,
    strength: 2,
  });
  if (glowF.colors === undefined) {
    throw new Error('[filter-gradient-glow] expected gradientGlow filter to carry a colors property');
  }

  // Center of the square (within the RESULT tile) must still be white.
  const cx = Math.round((RESULT_X + TILE / 2) * s);
  const cy = Math.round((TOP + TILE / 2) * s);
  const center = getSurfacePixelRGB(frame, cx, cy);
  if (!channelsClose(center, 0xffffff, 24)) {
    throw new Error(`[filter-gradient-glow] square center expected white, got #${hex(center)}`);
  }

  // Just outside each edge (~2px) the magenta glow ring must be present. The gradient glow fades
  // with distance from the silhouette, so close to the edge it is bright but a few px out it dims
  // toward black; assert magenta-DOMINANT (R and B both present and clearly above G) rather than a
  // fixed high threshold. This still fails if the ring is absent (black), the wrong hue, or if the
  // green channel is not suppressed — i.e. if the filter or its gradient ramp were broken.
  const off = 2;
  const edges: ReadonlyArray<readonly [number, number]> = [
    [TILE / 2, SQUARE_Y - off], // above top edge
    [TILE / 2, SQUARE_Y + SQUARE + off], // below bottom edge
    [SQUARE_X - off, TILE / 2], // left of left edge
    [SQUARE_X + SQUARE + off, TILE / 2], // right of right edge
  ];
  for (const [lx, ly] of edges) {
    const px = Math.round((RESULT_X + lx) * s);
    const py = Math.round((TOP + ly) * s);
    const got = getSurfacePixelRGB(frame, px, py);
    const r = (got >> 16) & 255;
    const g = (got >> 8) & 255;
    const b = got & 255;
    if (r <= 30 || b <= 30 || r <= g || b <= g) {
      throw new Error(
        `[filter-gradient-glow] magenta glow ring missing at (${lx},${ly}); expected magenta, got #${hex(got)}`,
      );
    }
  }

  // Far background (tile corner) stays black — the glow does not reach it.
  const bx = Math.round((RESULT_X + 8) * s);
  const by = Math.round((TOP + 8) * s);
  const bg = getSurfacePixelRGB(frame, bx, by);
  if (!channelsClose(bg, 0x000000, 24)) {
    throw new Error(`[filter-gradient-glow] far background expected black, got #${hex(bg)}`);
  }
}

function channelsClose(a: number, b: number, tol = 16): boolean {
  return (
    Math.abs(((a >> 16) & 255) - ((b >> 16) & 255)) <= tol &&
    Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)) <= tol &&
    Math.abs((a & 255) - (b & 255)) <= tol
  );
}

function hex(rgb: number): string {
  return rgb.toString(16).padStart(6, '0');
}
