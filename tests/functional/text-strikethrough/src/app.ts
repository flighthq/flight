// text-strikethrough — validates the strikethrough (line-through) text decoration: a RichText whose format
// range sets TextFormat.strikethrough = true draws a horizontal stroke THROUGH the glyph bodies at mid
// height, in the text color. Purely visual — the line is added by the rasterizer and does not affect
// layout — so only a real render proves it.
//
// BACKEND CAVEAT: strikethrough is drawn ONLY by the canvas and dom RichText renderers. The gl/wgpu
// RichText renderers handle `format.underline` but NOT `format.strikethrough`, so this test is scoped to
// "renderers":["canvas","dom"] in package.json. (Underline, which all four backends draw, is covered by
// the sibling text-underline test across all backends.) If/when the GPU renderers gain strikethrough, add
// "webgl"/"webgpu" here.
//
// Oracle (coverage-based, lenient): canvasRichText draws the strike at baseline - ascent*0.35, i.e. through
// the upper-middle of the glyph bodies. A scanline through that mid-height carries BOTH glyph ink and the
// continuous strike, so a struck word shows a much wider continuous ink run across the mid-band than the
// glyphs alone would (the strike bridges the inter-glyph gaps). We require a wide continuous run through
// the mid-height band; estimates are fuzzy because exact metrics are font-dependent and we cannot run a
// browser.
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  createDisplayContainer,
  createRichText,
  getSurfacePixelRgb,
  RichTextKind,
  setRichTextFormatRange,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

const INK = 0x44ffee; // bright cyan text + strike, far from the black background
const FIELD_X = 120;
const FIELD_Y = 240;
const FIELD_W = 560;
const FIELD_H = 120;
const FONT_SIZE = 72;

const TEXT = 'Flight';

const { height, render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff,
  kinds: [RichTextKind],
});

const root = createDisplayContainer();

const field = createRichText();
field.data.defaultTextFormat = { font: 'sans-serif', size: FONT_SIZE, bold: true };
field.data.multiline = false;
field.data.wordWrap = false;
field.x = FIELD_X;
field.y = FIELD_Y;
field.data.width = FIELD_W;
field.data.height = FIELD_H;
field.data.text = TEXT;

// One format range over the whole string: bright color + strikethrough.
setRichTextFormatRange(field, { color: INK, strikethrough: true }, 0, TEXT.length);

addNodeChild(root, field);

render(root);

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width;
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));

  // The strike crosses the glyphs near their upper-middle. With FONT_SIZE 72 and the baseline ~0.8 * size
  // below the line top, baseline - ascent*0.35 lands around 0.5 * size below the line top. Search a band
  // around that mid-height for a wide continuous ink run (glyphs + strike bridging their gaps).
  const bandTop = FIELD_Y + Math.round(FONT_SIZE * 0.4);
  const bandBottom = FIELD_Y + Math.round(FONT_SIZE * 0.65);

  const widestRun = findWidestInkRunInBand(at, FIELD_X, FIELD_X + FIELD_W, bandTop, bandBottom);
  // For a 6-char word at size 72 the struck run is well over 120px and, crucially, continuous across the
  // inter-glyph gaps that an un-struck word would break at.
  if (widestRun < 120) {
    throw new Error(
      `[text-strikethrough] no wide continuous ink run found in the mid-height band (widest run ` +
        `${widestRun}px, expected >= 120px) — the strikethrough stroke does not appear to be drawn`,
    );
  }
}

function findWidestInkRunInBand(
  at: (x: number, y: number) => number,
  x0: number,
  x1: number,
  yTop: number,
  yBottom: number,
): number {
  let widest = 0;
  for (let y = yTop; y <= yBottom; y += 2) {
    let run = 0;
    for (let x = x0; x < x1; x += 1) {
      if (isInk(at(x, y))) {
        run += 1;
        if (run > widest) widest = run;
      } else {
        run = 0;
      }
    }
  }
  return widest;
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
// Near 0x44ffee: low-ish red, high green, high blue. Anti-aliased edges blend toward black, so lenient.
function isInk(rgb: number): boolean {
  return channel(rgb, 16) < 150 && channel(rgb, 8) > 120 && channel(rgb, 0) > 120;
}
