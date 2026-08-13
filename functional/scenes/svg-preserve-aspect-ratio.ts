// svg-preserve-aspect-ratio — render coverage for preserveAspectRatio on <image>: that the fit mode
// (none vs meet) and the alignment (xMidYMid vs xMinYMin) both reach the rasterizer.
//
// THE SOURCE MUST BE NON-SQUARE OR THE FEATURE IS INVISIBLE. preserveAspectRatio only does anything
// when the source aspect differs from the destination box, so a square source into a square box renders
// identically under every mode — a scene built that way would pass with the whole attribute ignored.
// Here a 2:1 source goes into a 1:1 box, which makes each mode land the content somewhere different.
//
// EACH CASE IS PINNED BY WHERE THE EMPTY BANDS ARE, not merely by "something drew". Under `none` the
// content is stretched to fill the box, so the box has no empty band at all. Under `meet` it is scaled
// uniformly and letterboxed, so two bands are empty — and WHICH bands separates the alignments:
// xMidYMid centres the content, leaving equal bands above and below, while xMinYMin pushes it to the
// top, leaving one band below and none above. Asserting the empty bands is what makes this a test of
// fitting rather than of drawing.
//
// The source carries four distinctly-coloured quadrants so a stretch cannot be confused with a crop and
// an alignment cannot be confused with a flip: every mode must still show red, green, blue and white in
// that arrangement, only at different places and scales.
//
// SCOPE, STATED NARROWLY: preserveAspectRatio on <image>, for `none`, the default `xMidYMid meet`, and
// `xMinYMin meet`. It does not cover `slice`, the remaining seven alignments, preserveAspectRatio on a
// <symbol> viewport or a nested <svg>, or the interaction with a viewBox. Read a pass as "fit mode and
// alignment reach the rasterizer," never as "preserveAspectRatio is covered."
//
// The oracle gates canvas, webgl and webgpu — not dom. The DOM verifier has no pixels to read back and
// returns after checking the target element has children, before any oracle runs (functionalVerify.ts).
import type { Bitmap, ImportDiagnostic } from '@flighthq/sdk';
import {
  addNodeChild,
  createDisplayObject,
  createImageResourceFromCanvas,
  createScene2DFromSvgDocument,
  getBitmapPixelRgb,
  ShapeKind,
  SpriteKind,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

// A 2:1 source. The aspect mismatch against a square box is the whole point.
const SOURCE_W = 40;
const SOURCE_H = 20;

const BOX = 200;
const BOX_Y = 60;
const STRETCH_X = 40;
const CENTRED_X = 280;
const TOP_ALIGNED_X = 520;

// Uniform fit of a 2:1 source into a square box scales by the height limit, so the content is the full
// box wide and half the box tall — which is what makes the letterbox bands a quarter-box each.
const FIT_H = BOX / 2;
const CENTRED_BAND = (BOX - FIT_H) / 2;

const IMAGE_HREF = 'quadrants.png';

const SVG_SOURCE = `<svg width="${WIDTH}" height="${HEIGHT}">
  <image href="${IMAGE_HREF}" preserveAspectRatio="none"
         x="${STRETCH_X}" y="${BOX_Y}" width="${BOX}" height="${BOX}"/>
  <image href="${IMAGE_HREF}" preserveAspectRatio="xMidYMid meet"
         x="${CENTRED_X}" y="${BOX_Y}" width="${BOX}" height="${BOX}"/>
  <image href="${IMAGE_HREF}" preserveAspectRatio="xMinYMin meet"
         x="${TOP_ALIGNED_X}" y="${BOX_Y}" width="${BOX}" height="${BOX}"/>
</svg>`;

const { render } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff, // opaque black (packed RGBA)
  kinds: [ShapeKind, SpriteKind],
});

const root = createDisplayObject();

const diagnostics: ImportDiagnostic[] = [];
const imported = createScene2DFromSvgDocument(SVG_SOURCE, diagnostics, {
  resolveImageResource: () => createImageResourceFromCanvas(buildQuadrantCanvas()),
});
if (diagnostics.length > 0) {
  throw new Error(
    `[svg-preserve-aspect-ratio] clean document raised ${diagnostics.length} diagnostic(s): ${JSON.stringify(diagnostics)}`,
  );
}
addNodeChild(root, imported);

render(root);

export function assertRender(frame: Readonly<Bitmap>): void {
  const scale = frame.width / WIDTH;
  const at = (x: number, y: number): number => getBitmapPixelRgb(frame, Math.round(x * scale), Math.round(y * scale));

  // `none`: stretched to fill the box, so the quadrants occupy its four corners and no band is empty.
  assertQuadrants('none', at, STRETCH_X, BOX_Y, BOX, BOX);
  if (isBackground(at(STRETCH_X + BOX / 2, BOX_Y + 6))) {
    throw new Error(`[svg-preserve-aspect-ratio] preserveAspectRatio="none" left an empty band — it did not stretch`);
  }

  // `xMidYMid meet`: uniform fit, centred, so equal empty bands above and below.
  assertQuadrants('xMidYMid meet', at, CENTRED_X, BOX_Y + CENTRED_BAND, BOX, FIT_H);
  if (!isBackground(at(CENTRED_X + BOX / 2, BOX_Y + CENTRED_BAND / 2))) {
    throw new Error(`[svg-preserve-aspect-ratio] xMidYMid meet has no empty band ABOVE the content`);
  }
  if (!isBackground(at(CENTRED_X + BOX / 2, BOX_Y + BOX - CENTRED_BAND / 2))) {
    throw new Error(`[svg-preserve-aspect-ratio] xMidYMid meet has no empty band BELOW the content`);
  }

  // `xMinYMin meet`: uniform fit pushed to the top, so the empty band is entirely below.
  assertQuadrants('xMinYMin meet', at, TOP_ALIGNED_X, BOX_Y, BOX, FIT_H);
  if (isBackground(at(TOP_ALIGNED_X + BOX / 2, BOX_Y + 6))) {
    throw new Error(
      `[svg-preserve-aspect-ratio] xMinYMin meet left an empty band ABOVE the content, so it is not ` +
        `top-aligned — that is the xMidYMid placement`,
    );
  }
  if (!isBackground(at(TOP_ALIGNED_X + BOX / 2, BOX_Y + BOX - 12))) {
    throw new Error(`[svg-preserve-aspect-ratio] xMinYMin meet has no empty band BELOW the content`);
  }
}

// Every mode must still show the same quadrant arrangement — only its placement and scale change. This
// is what keeps a stretch from being confused with a crop, or an alignment with a flip.
function assertQuadrants(
  label: string,
  at: (x: number, y: number) => number,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const quarterW = width / 4;
  const quarterH = height / 4;
  const check = (name: string, match: (rgb: number) => boolean, column: number, row: number): void => {
    const pixel = at(x + column * quarterW * 2 + quarterW, y + row * quarterH * 2 + quarterH);
    if (!match(pixel)) {
      throw new Error(
        `[svg-preserve-aspect-ratio] ${label}: expected ${name} in the ${row === 0 ? 'top' : 'bottom'}-` +
          `${column === 0 ? 'left' : 'right'} quadrant — got #${hex(pixel)}`,
      );
    }
  };
  check('red', isRed, 0, 0);
  check('green', isGreen, 1, 0);
  check('blue', isBlue, 0, 1);
  check('white', isWhite, 1, 1);
}

function buildQuadrantCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = SOURCE_W;
  canvas.height = SOURCE_H;
  const context = canvas.getContext('2d')!;
  const halfW = SOURCE_W / 2;
  const halfH = SOURCE_H / 2;
  context.fillStyle = '#ff0000';
  context.fillRect(0, 0, halfW, halfH);
  context.fillStyle = '#00ff00';
  context.fillRect(halfW, 0, halfW, halfH);
  context.fillStyle = '#0000ff';
  context.fillRect(0, halfH, halfW, halfH);
  context.fillStyle = '#ffffff';
  context.fillRect(halfW, halfH, halfW, halfH);
  return canvas;
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 0xff;
}

function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}

function isBackground(rgb: number): boolean {
  return channel(rgb, 16) < 60 && channel(rgb, 8) < 60 && channel(rgb, 0) < 60;
}

function isBlue(rgb: number): boolean {
  return channel(rgb, 0) > 150 && channel(rgb, 16) < 110 && channel(rgb, 8) < 110;
}

function isGreen(rgb: number): boolean {
  return channel(rgb, 8) > 150 && channel(rgb, 16) < 110 && channel(rgb, 0) < 110;
}

function isRed(rgb: number): boolean {
  return channel(rgb, 16) > 150 && channel(rgb, 8) < 110 && channel(rgb, 0) < 110;
}

function isWhite(rgb: number): boolean {
  return channel(rgb, 16) > 150 && channel(rgb, 8) > 150 && channel(rgb, 0) > 150;
}
