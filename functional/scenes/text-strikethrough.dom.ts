// DOM variant of text-strikethrough. The scene is intentionally identical to the shared
// Canvas/WebGL/WebGPU target; only its scene assertion differs. Native CSS font metrics put DOM's line-through below
// the tighter raster-backend band, so DOM keeps the wider band that its captured render has demonstrated it
// needs.
//
// This looseness is deliberate and isolated. The bottom edge reaches the estimated baseline, so a decoration
// incorrectly drawn at the baseline could satisfy the continuity check. That risk belongs only to DOM's
// native-metrics scene assertion; it is not a reason to weaken the three raster backends whose strike stays well clear
// of the baseline.
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

setRichTextFormatRange(field, { color: INK, strikethrough: true }, 0, TEXT.length);

addNodeChild(root, field);

render(root);

export function assertRender(frame: Readonly<Bitmap>): void {
  const s = frame.width / width;
  const at = (x: number, y: number): number => getBitmapPixelRgb(frame, Math.round(x * s), Math.round(y * s));

  // DOM's native line-through sits outside the shared 0.40..0.65 raster band. Search the measured native
  // range instead, retaining the same continuous-run requirement that distinguishes a decoration from the
  // separated glyph bodies.
  const bandTop = FIELD_Y + Math.round(FONT_SIZE * 0.35);
  const bandBottom = FIELD_Y + Math.round(FONT_SIZE * 0.8);

  const widestRun = findWidestInkRunInBand(at, FIELD_X, FIELD_X + FIELD_W, bandTop, bandBottom);
  if (widestRun < 120) {
    throw new Error(
      `[text-strikethrough/dom] no wide continuous ink run found in the native CSS line-through band ` +
        `(widest run ${widestRun}px, expected >= 120px) — the strikethrough stroke does not appear to be drawn`,
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

function isInk(rgb: number): boolean {
  return channel(rgb, 16) < 150 && channel(rgb, 8) > 120 && channel(rgb, 0) > 120;
}
