// filter-displacement-map-color — validates DisplacementMapFilter in 'color' mode against out-of-bounds fill.
//
// Surface-based filter test: build a known source surface plus a displacement map, apply the filter ONCE
// via applyDisplacementMapFilterToSurface, then blit source | result 1:1 as bitmaps. The warp runs on the
// surface in JS, so every backend draws identical bytes. The map's red channel is a horizontal ramp whose
// extremes push samples PAST the source on the left and right; with mode 'color' those out-of-bounds
// samples are filled with the packed fill colour (red) instead of wrapped content. The oracle checks the
// displaced edge bands show the fill colour and the centre still shows the undisplaced white square.
import { createDisplacementMapFilter } from '@flighthq/filters';
import { applyDisplacementMapFilterToSurface } from '@flighthq/filters-surface';
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
  getSurfacePixelRgb,
  setSurfacePixel,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const TILE = 256;
const SOURCE_X = 120;
const RESULT_X = 424;

// Source: a white square smaller than the tile, centred on an opaque-black field, so displacement near
// the tile edges samples beyond the white content.
const SQUARE = 160;
const MARGIN = (TILE - SQUARE) / 2;
const source = createSurface(TILE, TILE, 0x000000ff);
fillSurfaceRectangle(createSurfaceRegion(source, MARGIN, MARGIN, SQUARE, SQUARE), 0xffffffff);

// Displacement map: red channel ramps 0 → 255 left → right (green/blue/alpha held neutral/opaque). With
// componentX=0 and scaleX=40 the X shift is (red/255 − 0.5) × 40, i.e. −20px at the left edge and +20px
// at the right edge — pushing those columns past the source bounds. componentY default uses green (0)
// for Y, but scaleY defaults to 0, so there is no vertical shift.
const map = createSurface(TILE, TILE, 0x000000ff);
for (let x = 0; x < TILE; x++) {
  const red = Math.round((x / (TILE - 1)) * 255);
  const packed = (red << 24) | 0x000000ff;
  for (let y = 0; y < TILE; y++) {
    setSurfacePixel(map, x, y, packed >>> 0);
  }
}

// mode 'color': out-of-bounds samples fill with opaque red (0xff0000, alpha 1).
const result = new Uint8ClampedArray(TILE * TILE * 4);
applyDisplacementMapFilterToSurface(
  result,
  createSurfaceRegion(source),
  createSurfaceRegion(map),
  createDisplacementMapFilter({ mode: 'color', color: 0xff0000, alpha: 1, componentX: 0, scaleX: 40 }),
);

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

// Oracle samples in the RESULT tile (local TILE coordinates):
//   left band (col 8) and right band (col 248) sample past the source → opaque red fill.
//   centre (128,128) keeps the undisplaced white square (≈ neutral shift).
const EXPECT = [
  { lx: 8, ly: 128, kind: 'red' },
  { lx: 248, ly: 128, kind: 'red' },
  { lx: 128, ly: 128, kind: 'white' },
] as const;

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale (canvas may be width × devicePixelRatio)
  for (const { lx, ly, kind } of EXPECT) {
    const px = Math.round((RESULT_X + lx) * s);
    const py = Math.round((TOP + ly) * s);
    const got = getSurfacePixelRgb(frame, px, py);
    const r = (got >> 16) & 255;
    const g = (got >> 8) & 255;
    const b = got & 255;
    if (kind === 'red') {
      if (!(r > 150 && g < 80 && b < 80)) {
        throw new Error(
          `[filter-displacement-map-color] displaced band at (${lx},${ly}) expected red fill, got #${hex(got)}`,
        );
      }
    } else if (!channelsClose(got, 0xffffff)) {
      throw new Error(
        `[filter-displacement-map-color] centre at (${lx},${ly}) expected white square, got #${hex(got)}`,
      );
    }
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
