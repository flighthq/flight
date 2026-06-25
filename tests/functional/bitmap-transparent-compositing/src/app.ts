// bitmap-transparent-compositing — validates that a Bitmap with per-pixel ALPHA composites correctly over
// a colored background, both at full node alpha and at a reduced node alpha. The source image is a radial
// alpha ramp: opaque white at the center fading to fully transparent at the edges. It is drawn twice over
// an opaque BLUE background — once at node.alpha = 1, once at node.alpha = 0.5.
//
// The oracle pins down the two ways a compositing bug shows up:
//   • The transparent EDGE of both copies must read as the blue background, proving alpha=0 source pixels
//     contribute nothing (no opaque-white halo, no black box from ignored alpha).
//   • The opaque CENTER must blend white over blue. At node.alpha = 1 the center is ~white. At
//     node.alpha = 0.5 the center is white-at-half over blue → LIGHT blue (B high, R&G ≈ 128). A premultiply
//     mishandling (e.g. dividing by alpha twice, or compositing un-premultiplied as premultiplied) would
//     instead darken the blend toward black/dark-blue — so requiring R&G near mid-gray, not near zero,
//     specifically catches the dark-fringe class of errors.
//
// This is visual because per-pixel alpha compositing and node-alpha modulation only exist after the source
// is blended against the actual destination pixels; it cannot be observed without rasterizing the overlay.
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  BitmapKind,
  createBitmap,
  createDisplayContainer,
  createImageResourceFromCanvas,
  getSurfacePixelRgb,
  invalidateNodeAppearance,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

// Source image: square with a radial white→transparent alpha ramp.
const IMG_SIZE = 240;
const RADIUS = IMG_SIZE / 2;

// Two copies. Each is IMG_SIZE square at its top-left; centers and edges computed from that.
const FULL_X = 120; // node.alpha = 1
const FULL_Y = 180;
const HALF_X = 440; // node.alpha = 0.5
const HALF_Y = 180;

function buildAlphaRampCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = IMG_SIZE;
  canvas.height = IMG_SIZE;
  const ctx = canvas.getContext('2d')!;
  const cx = IMG_SIZE / 2;
  const cy = IMG_SIZE / 2;
  // Opaque white at the center, fully transparent white at the rim. Same color, only alpha varies, so the
  // ramp is purely an alpha gradient.
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, RADIUS);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, IMG_SIZE, IMG_SIZE);
  return canvas;
}

const { render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x0000ffff, // opaque blue (packed RGBA, low byte = alpha)
  kinds: [BitmapKind],
});

const root = createDisplayContainer();

function placeRamp(x: number, y: number, alpha: number): void {
  const bmp = createBitmap();
  bmp.data.image = createImageResourceFromCanvas(buildAlphaRampCanvas());
  bmp.data.smoothing = true;
  bmp.x = x;
  bmp.y = y;
  bmp.alpha = alpha;
  invalidateNodeAppearance(bmp);
  addNodeChild(root, bmp);
}

placeRamp(FULL_X, FULL_Y, 1);
placeRamp(HALF_X, HALF_Y, 0.5);

render(root);

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));

  const fullCenter = at(FULL_X + IMG_SIZE / 2, FULL_Y + IMG_SIZE / 2);
  const halfCenter = at(HALF_X + IMG_SIZE / 2, HALF_Y + IMG_SIZE / 2);
  // Edge: a few pixels inside the top-left corner, well outside the ramp's bright core (alpha ~0 there).
  const fullEdge = at(FULL_X + 6, FULL_Y + 6);
  const halfEdge = at(HALF_X + 6, HALF_Y + 6);

  // node.alpha = 1, opaque center → ~white (opaque white fully covers the blue).
  if (!isWhite(fullCenter)) {
    throw new Error(`[bitmap-transparent-compositing] alpha=1 center not ~white — got #${hex(fullCenter)}`);
  }

  // node.alpha = 0.5, opaque center → white-over-blue blend = LIGHT blue: B high, R&G near mid (≈128).
  // R&G must be mid-range (not near 0): near-0 would mean the white was darkened into the blue, the
  // classic premultiply dark-fringe bug.
  if (!isLightBlue(halfCenter)) {
    throw new Error(
      `[bitmap-transparent-compositing] alpha=0.5 center not light-blue (white-over-blue blend) — ` +
        `got #${hex(halfCenter)}; a dark result here indicates a premultiply error`,
    );
  }

  // Transparent edge of BOTH copies → background blue (source contributes nothing where alpha≈0).
  if (!isBlue(fullEdge)) {
    throw new Error(
      `[bitmap-transparent-compositing] alpha=1 transparent edge not background blue — got #${hex(fullEdge)}`,
    );
  }
  if (!isBlue(halfEdge)) {
    throw new Error(
      `[bitmap-transparent-compositing] alpha=0.5 transparent edge not background blue — got #${hex(halfEdge)}`,
    );
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
function isWhite(rgb: number): boolean {
  return channel(rgb, 16) > 200 && channel(rgb, 8) > 200 && channel(rgb, 0) > 200;
}
// Background blue: B high, R and G low.
function isBlue(rgb: number): boolean {
  return channel(rgb, 0) > 180 && channel(rgb, 16) < 80 && channel(rgb, 8) < 80;
}
// White-over-blue at half alpha: B high, R and G lifted into the mid band (white pulling them up from 0),
// but not all the way to white. Generous mid window guards against the dark-fringe premultiply bug.
function isLightBlue(rgb: number): boolean {
  const r = channel(rgb, 16);
  const g = channel(rgb, 8);
  const b = channel(rgb, 0);
  return b > 180 && r >= 70 && r <= 200 && g >= 70 && g <= 200;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
