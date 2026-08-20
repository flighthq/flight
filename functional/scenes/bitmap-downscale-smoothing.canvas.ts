// ★ SCOPE DECLARATION, NOT A GAP. The fingerprint regression gate is NOT the instrument for this scene:
// the subject is sub-cell by construction. A 256x256 checkerboard minified to 0.3x averages to flat grey in
// a 16x16 grid whether smoothing is ON or OFF, so the two states this scene exists to tell apart produce the
// SAME fingerprint; committed contrast is 0.01. `assertRender` classifies sampled pixels as mid-grey or
// near-pure and requires zero mid-greys under nearest and several under bilinear, which does separate them.
//
// There is nothing here to close. The limitation is structural — the fingerprint cannot represent this
// subject — rather than a missing capability, so this must never be filed later as an unfixed gap.
//
// This Canvas/DOM pair exercises the native 2D sampling paths. The GPU backends no longer have the old
// global-filter limitation: `bitmap-perbitmap-smoothing` proves that Gl reapplies sampler state per bind
// and Wgpu selects the Texture's LINEAR/NEAREST sampler variant per draw.
//
// bitmap-downscale-smoothing — validates Bitmap.smoothing under DOWN-scaling, the minification case the
// existing bitmap-smoothing test (upscaling) does not cover. A large 256×256 high-frequency checkerboard
// (8px black/white cells) is drawn twice, each scaled DOWN to ~0.3× (~77px). With smoothing OFF
// (nearest-neighbor), minification point-samples one source texel per output pixel: because the source is
// pure black/white, every output pixel stays near-pure black or white — the image aliases into hard noise
// with no intermediate tones. With smoothing ON, bilinear minification averages several source texels per
// output pixel, so the dense checker collapses toward gray and many pixels carry MID-GRAY (intermediate)
// values.
//
// This is visual because the distinction lives entirely in how the rasterizer resolves many source texels
// into one output pixel during minification; it cannot be observed without actually downscaling the image.
import type { Bitmap } from '@flighthq/sdk';
import {
  addNodeChild,
  SpriteKind,
  createSprite,
  createDisplayObject,
  createImageResourceFromCanvas,
  createPixelArtSampler,
  createTexture,
  getBitmapPixelRgb,
  invalidateNodeLocalTransform,
} from '@flighthq/sdk';
import { createFunctionalTarget, declareAntialiasingPolicy } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

// Source: 256×256 checkerboard with 8px cells → 32×32 cells of alternating black/white. High frequency so
// minification has many texels to average per output pixel.
const SRC_SIZE = 256;
const CELL = 8;

// Downscale factor: 256 * 0.3 ≈ 77px on screen.
const SCALE = 0.3;
const OUT_SIZE = SRC_SIZE * SCALE; // ≈ 76.8

// Two copies side by side, vertically centered-ish.
const ALIAS_X = 200; // smoothing = false
const ALIAS_Y = 260;
const SMOOTH_X = 520; // smoothing = true
const SMOOTH_Y = 260;

// Sample band: a horizontal row of points across the interior of each downscaled image, avoiding the very
// edges (which can be partially off-image). Spans roughly 10%..90% of the output width at vertical center.
const BAND_Y_FRAC = 0.5;
const BAND_X_FRACS: readonly number[] = [0.12, 0.22, 0.32, 0.42, 0.5, 0.58, 0.68, 0.78, 0.88];

function buildCheckerCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = SRC_SIZE;
  canvas.height = SRC_SIZE;
  const ctx = canvas.getContext('2d')!;
  const cells = SRC_SIZE / CELL;
  for (let row = 0; row < cells; row++) {
    for (let col = 0; col < cells; col++) {
      ctx.fillStyle = (col + row) % 2 === 0 ? '#ffffff' : '#000000';
      ctx.fillRect(col * CELL, row * CELL, CELL, CELL);
    }
  }
  return canvas;
}

declareAntialiasingPolicy('aa');

const { render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x808080ff, // opaque mid-gray, so off-image samples are distinguishable from content.
  expectedImageDescription:
    'On a flat opaque mid-gray field, two small squares of about 77x77 sit side by side at the same ' +
    'height, near x 200 and x 520 at y 260. Both are the same 256x256 black/white checkerboard (8px ' +
    'cells) scaled down to roughly 0.3x, so the difference between them is entirely in TONE, not in ' +
    'position, size or placement. The LEFT square (smoothing off) is HARSH: hard black-and-white speckle ' +
    'with essentially no intermediate tones, reading as high-contrast noise against the gray. The RIGHT ' +
    'square (smoothing on) is SOFT: the checker averages away into mottled mid-tones with little or no ' +
    'pure black or pure white, close enough in overall lightness to the background that it reads as a ' +
    'low-contrast patch rather than a crisp square. Mid-tones present on the right and absent on the ' +
    'left is the whole claim.',
  kinds: [SpriteKind],
});

const root = createDisplayObject();

function placeChecker(x: number, y: number, smoothing: boolean): void {
  const bmp = createSprite();
  bmp.data.texture = createTexture({
    sampler: smoothing ? undefined : createPixelArtSampler(),
    dimension: '2d',
    source: createImageResourceFromCanvas(buildCheckerCanvas()),
  });
  bmp.x = x;
  bmp.y = y;
  bmp.scaleX = SCALE;
  bmp.scaleY = SCALE;
  invalidateNodeLocalTransform(bmp);
  addNodeChild(root, bmp);
}

placeChecker(ALIAS_X, ALIAS_Y, false);
placeChecker(SMOOTH_X, SMOOTH_Y, true);

render(root);

export function assertRender(frame: Readonly<Bitmap>): void {
  const s = frame.width / width; // device-pixel scale
  const at = (x: number, y: number): number => getBitmapPixelRgb(frame, Math.round(x * s), Math.round(y * s));

  // Sample the band across each downscaled image and classify pixels.
  const aliasSamples = sampleBand(at, ALIAS_X, ALIAS_Y);
  const smoothSamples = sampleBand(at, SMOOTH_X, SMOOTH_Y);

  // smoothing = FALSE (nearest): every sampled pixel should be near-pure black or white. No pixel should
  // carry all three channels in the mid range (60..200) — that would indicate averaging, which nearest
  // does not do.
  const aliasMid = aliasSamples.filter(isMidGray).length;
  if (aliasMid > 0) {
    throw new Error(
      `[bitmap-downscale-smoothing] smoothing=false produced ${aliasMid} mid-gray sample(s); ` +
        `nearest-neighbor minification of a pure black/white source must stay near-pure — ` +
        `samples: ${aliasSamples.map(hex).join(',')}`,
    );
  }

  // smoothing = TRUE (bilinear): averaging across the dense checker must yield intermediate tones. Require
  // at least a few samples with a channel in the 80..180 band.
  const smoothMid = smoothSamples.filter(hasIntermediateChannel).length;
  if (smoothMid < 3) {
    throw new Error(
      `[bitmap-downscale-smoothing] smoothing=true produced only ${smoothMid} intermediate sample(s); ` +
        `bilinear minification should average the dense checker toward gray — ` +
        `samples: ${smoothSamples.map(hex).join(',')}`,
    );
  }
}

function sampleBand(at: (x: number, y: number) => number, originX: number, originY: number): readonly number[] {
  const y = originY + OUT_SIZE * BAND_Y_FRAC;
  return BAND_X_FRACS.map((fx) => at(originX + OUT_SIZE * fx, y));
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
// All three channels sit in the mid band — evidence of true averaging (a blended gray, not pure b/w).
function isMidGray(rgb: number): boolean {
  const r = channel(rgb, 16);
  const g = channel(rgb, 8);
  const b = channel(rgb, 0);
  return r >= 60 && r <= 200 && g >= 60 && g <= 200 && b >= 60 && b <= 200;
}
// At least one channel in the 80..180 band — a looser "this pixel is not pure black/white" probe.
function hasIntermediateChannel(rgb: number): boolean {
  return inBand(channel(rgb, 16)) || inBand(channel(rgb, 8)) || inBand(channel(rgb, 0));
}
function inBand(v: number): boolean {
  return v >= 80 && v <= 180;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
