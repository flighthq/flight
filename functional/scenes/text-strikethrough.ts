// text-strikethrough — validates the strikethrough (line-through) text decoration: a RichText whose format
// range sets TextFormat.strikethrough = true draws a horizontal stroke THROUGH the glyph bodies at mid
// height, in the text color. Purely visual — the line is added by the rasterizer and does not affect
// layout — so only a real render proves it.
//
// All four backends draw strikethrough: canvas/dom natively, and gl/wgpu through their canvas-raster
// RichText path (glRichText/wgpuRichText draw the strike at baseline - ascent*0.35, mirroring
// scene2d-canvas). Canvas/WebGL/WebGPU share this tight scene assertion. DOM uses the otherwise-identical
// text-strikethrough.dom.ts variant because native CSS font metrics put its strike below this band.
//
// Scene assertion (coverage-based, lenient): the strike sits at baseline - ascent*0.35, i.e. through the
// upper-middle of the glyph bodies. A scanline through that mid-height carries BOTH glyph ink and the
// continuous strike, so a struck word shows a much wider continuous ink run across the mid-band than the
// glyphs alone would (the strike bridges the inter-glyph gaps). The narrow mid-height band deliberately
// stays clear of the estimated baseline, so an underline misplaced at the baseline cannot satisfy it.
import type { Bitmap } from '@flighthq/sdk';
import {
  addNodeChild,
  createDisplayObject,
  createRichText,
  getBitmapPixelRgb,
  RichTextKind,
  setRichTextFormatRange,
} from '@flighthq/sdk';
import { createFunctionalTarget, declareAntialiasingPolicy } from '@ft/render';

// ★ FRAMED AROUND THE SUBJECT, DELIBERATELY. The frame holds the text box plus a 20 px margin
// rather than floating it in an 800x600 field that was mostly empty. The empty field is not free:
// the regression gate scores a change as a MEAN over the whole frame, so padding dilutes every
// defect by the ratio of the areas — measured across this family, moving the whole picture one
// fingerprint cell scored 0.79-1.78 at 800x600 and 4.79-30.10 over the subject's own bounding box.
// Nothing this scene tests depends on the extra black.
const WIDTH = 600;
const HEIGHT = 160;

const INK = 0x44ffeeff; // bright cyan text + strike, far from the black background
const FIELD_X = 20;
const FIELD_Y = 20;
const FIELD_W = 560;
const FIELD_H = 120;
const FONT_SIZE = 72;

const TEXT = 'Flight';

declareAntialiasingPolicy('aa');

const { render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff,
  kinds: [RichTextKind],
  expectedImageDescription:
    'A 600x160 opaque black field with one line of bright cyan text reading Flight at about 72 px, ' +
    'inside a 560x120 box at x 20-580, y 20-140. A horizontal cyan line runs THROUGH the glyph bodies at ' +
    'roughly their mid height — crossing the letters, not sitting under them — and it spans the width of ' +
    'the word rather than the width of the box, so it starts and ends near the first and last glyph. ' +
    'A picture with the same text and no line through it, or with the line below the letters instead of ' +
    'across them, is the failure. The line is the same cyan as the text, there is no box or border around ' +
    'the field, and the rest of the field is pure black.',
});

const root = createDisplayObject();

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

export function assertRender(frame: Readonly<Bitmap>): void {
  const s = frame.width / width;
  const at = (x: number, y: number): number => getBitmapPixelRgb(frame, Math.round(x * s), Math.round(y * s));

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
